import { IS_SQLITE } from './db-mode';

// Unified database client. Exports `supabase` which resolves to either the
// Supabase client or the SQLite client (sql.js). The SQLite client mimics the
// Supabase PostgREST + auth API so all pages work unchanged in both modes.
//
// Key design: `dbReady` is a promise that resolves once the client is
// initialized. Pages should `await dbReady` before using `supabase` in
// top-level code. AuthProvider already gates on dbReady internally.

type AnyClient = any;
let _client: AnyClient | null = null;

const dbReady: Promise<AnyClient> = (async () => {
  let c: AnyClient;
  if (IS_SQLITE) {
    const mod = await import('./sqlite-client');
    c = await mod.createSqliteClient();
  } else {
    const mod = await import('./supabase');
    c = mod.supabase;
  }
  _client = c;
  console.log(`[DB] Client ready (${IS_SQLITE ? 'SQLite' : 'Supabase'} mode)`);
  return c;
})();

export { dbReady };

// Synchronous access — returns the client if ready, throws otherwise.
// Use this inside components that are gated by dbReady in App.tsx.
export function getDb(): AnyClient {
  if (!_client) throw new Error('Database not ready. Await dbReady first.');
  return _client;
}

// A proxy that delegates to the real client once it's ready.
// For synchronous chains (from().select().eq()), it records calls and
// replays them when the result is awaited.
// For auth.onAuthStateChange, it returns a sync { data: { subscription } }.

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
// Other auth methods are async and just delegate.
function createAuthProxy(): any {
  const realSubscriptions: Array<() => void> = [];

  return new Proxy({} as any, {
    get(_t, prop: string) {
      if (prop === 'onAuthStateChange') {
        return (cb: (event: string, session: any) => void) => {
          let realUnsub: (() => void) | null = null;
          dbReady.then((client) => {
            const result = client.auth.onAuthStateChange(cb);
            if (result?.data?.subscription?.unsubscribe) {
              realUnsub = result.data.subscription.unsubscribe;
            }
          });
          return {
            data: {
              subscription: {
                unsubscribe: () => {
                  if (realUnsub) realUnsub();
                },
              },
            },
          };
        };
      }
      // All other auth methods — async delegation
      return (...args: any[]) =>
        dbReady.then((client) => {
          const method = client.auth[prop];
          return typeof method === 'function' ? method(...args) : method;
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
      dbReady.then((client) => client.removeChannel?.(ch));
    },
  } as any,
  {
    get(target, prop: string) {
      if (prop === 'auth') return authProxy;
      if (prop in target) return (target as any)[prop];
      return (...args: any[]) =>
        dbReady.then((client) => {
          const method = client[prop];
          return typeof method === 'function' ? method(...args) : method;
        });
    },
  },
);

export const supabase = mainProxy;
export const db = supabase;
