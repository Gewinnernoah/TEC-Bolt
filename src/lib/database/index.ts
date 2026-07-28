// Unified database client — single entry point for the entire app.
//
// This module picks the correct backend based on VITE_DB_MODE:
//   - 'sqlite'    → SQLite (sql.js WASM, persists to IndexedDB, fully offline)
//   - 'supabase'  → Supabase (cloud Postgres + Auth + Realtime)
//
// To switch backends, change VITE_DB_MODE in .env — no code changes needed.
// All pages import `supabase` from here, so the backend is transparent.
//
// Exports:
//   supabase  — the client (sync proxy that delegates after dbReady)
//   db        — alias for supabase
//   dbReady   — Promise that resolves once the client is initialized
//   getDb()   — sync getter (throws if not ready; use inside dbReady-gated components)
//   DB_MODE   — current mode string ('sqlite' | 'supabase')
//   IS_SQLITE / IS_SUPABASE — boolean flags

import { dbLog, logInit } from './logger';

export type { DbClient, DbMode, DbResult } from './types';

// ---------- Mode detection ----------
export type DbMode = 'supabase' | 'sqlite';

export function getDbMode(): DbMode {
  const mode = import.meta.env.VITE_DB_MODE as string | undefined;
  if (mode === 'sqlite') return 'sqlite';
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
    logInit('Mode: SQLite (offline)');
    const mod = await import('./sqlite-adapter');
    c = await mod.createSqliteClient();
  } else {
    logInit('Mode: Supabase (cloud)');
    const mod = await import('./supabase-adapter');
    c = mod.supabase;
  }
  _client = c;
  logInit(`Client ready (${DB_MODE})`);
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
