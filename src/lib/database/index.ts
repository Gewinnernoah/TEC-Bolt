// Einheitlicher Datenbank-Client — zentraler Einstiegspunkt fuer die gesamte App.
//
// Dieses Modul waehlt das richtige Backend anhand von VITE_DB_MODE:
//   - 'supabase'  → PostgreSQL (Standard, cloud oder lokal)
//   - 'sqlite'    → SQLite (Offline-Modus, sql.js WASM, IndexedDB)
//
// Um das Backend zu wechseln, VITE_DB_MODE in .env aendern — keine Code-Aenderungen noetig.
//
// Exporte:
//   supabase  — der Client (Sync-Proxy, delegiert nach dbReady)
//   db        — Alias fuer supabase
//   dbReady   — Promise, das aufloest sobald der Client bereit ist
//   getDb()   — Sync-Getter (wirft, wenn nicht bereit; in dbReady-gated Komponenten verwenden)
//   DB_MODE   — aktueller Modus ('sqlite' | 'supabase')
//   IS_SQLITE / IS_SUPABASE — boolesche Flags

import { dbLog, logInit } from './logger';

export type { DbClient, DbMode, DbResult } from './types';

// ---------- Mode detection ----------
export type DbMode = 'supabase' | 'sqlite';

export function getDbMode(): DbMode {
  const mode = import.meta.env.VITE_DB_MODE as string | undefined;
  if (mode === 'sqlite') return 'sqlite';
  // Default: PostgreSQL (via Supabase)
  return 'supabase';
}

export const DB_MODE = getDbMode();
export const IS_SUPABASE = DB_MODE === 'supabase';
export const IS_SQLITE = DB_MODE === 'sqlite';

// ---------- Client initialization ----------
type AnyClient = any;
let _client: AnyClient | null = null;

const dbReady: Promise<AnyClient> = (async () => {
  let c: AnyClient;
  if (IS_SQLITE) {
    logInit('Modus: SQLite (Offline)');
    const mod = await import('./sqlite-adapter');
    c = await mod.createSqliteClient();
  } else {
    logInit('Modus: PostgreSQL / Supabase');
    const mod = await import('./supabase-adapter');
    c = mod.supabase;
  }
  _client = c;
  logInit(`Client bereit (${DB_MODE})`);
  return c;
})();

export { dbReady };

export function getDb(): AnyClient {
  if (!_client) throw new Error('Database not ready. Await dbReady first.');
  return _client;
}

// ---------- Proxy: delegates to the real client after dbReady ----------
// For sync chains (from().select().eq().order()), records calls and replays
// them when the result is awaited.
// For auth.onAuthStateChange, returns a sync { data: { subscription } }.

interface Call {
  prop: string;
  args: any[];
}

function createChain(calls: Call[]): any {
  const fn = function () {
    return dbReady.then((client) => replay(client, calls));
  };

  fn.then = function (onFulfilled: any, onRejected?: any) {
    return dbReady
      .then((client) => replay(client, calls))
      .then(onFulfilled, onRejected);
  };

  return new Proxy(fn, {
    get(_t, prop: string) {
      if (prop === 'then') return fn.then;
      if (prop === 'catch') return (h: any) => fn.then(undefined, h);
      return (...args: any[]) => createChain([...calls, { prop, args }]);
    },
    apply() {
      return dbReady.then((client) => replay(client, calls));
    },
  });
}

function replay(client: any, calls: Call[]): any {
  let result = client;
  for (const c of calls) {
    result = result[c.prop](...c.args);
  }
  return result;
}

// Auth proxy: onAuthStateChange must return { data: { subscription } } synchronously.
function createAuthProxy(): any {
  return new Proxy({} as any, {
    get(_t, prop: string) {
      if (prop === 'onAuthStateChange') {
        return (cb: (event: string, session: any) => void) => {
          let realUnsub: (() => void) | null = null;
          dbReady.then((client) => {
            try {
              const result = client.auth.onAuthStateChange(cb);
              if (result?.data?.subscription?.unsubscribe) {
                realUnsub = result.data.subscription.unsubscribe;
              }
            } catch (e) {
              dbLog('error', 'auth.onAuthStateChange', 'Failed to register listener', { error: e });
            }
          });
          return {
            data: {
              subscription: {
                unsubscribe: () => {
                  if (realUnsub) {
                    try { realUnsub(); } catch (e) {
                      dbLog('warn', 'auth.unsubscribe', 'Unsubscribe failed', { error: e });
                    }
                  }
                },
              },
            },
          };
        };
      }
      return (...args: any[]) =>
        dbReady.then((client) => {
          // Call directly on client.auth to preserve `this` context
          return typeof client.auth[prop] === 'function' ? client.auth[prop](...args) : client.auth[prop];
        });
    },
  });
}

const authProxy = createAuthProxy();

const mainProxy = new Proxy(
  {
    from: (table: string) => createChain([{ prop: 'from', args: [table] }]),
    rpc: (fnName: string) => createChain([{ prop: 'rpc', args: [fnName] }]),
    channel: (name: string) => createChain([{ prop: 'channel', args: [name] }]),
    removeChannel: (ch: any) => {
      dbReady.then((client) => {
        try { client.removeChannel?.(ch); } catch { /* ignore */ }
      });
    },
  } as any,
  {
    get(target, prop: string) {
      if (prop === 'auth') return authProxy;
      if (prop in target) return (target as any)[prop];
      return (...args: any[]) =>
        dbReady.then((client) => {
          // Call directly on client to preserve `this` context
          return typeof client[prop] === 'function' ? client[prop](...args) : client[prop];
        });
    },
  },
);

export const supabase = mainProxy;
export const db = supabase;
