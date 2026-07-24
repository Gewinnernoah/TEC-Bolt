import { IS_SQLITE } from './db-mode';

// Unified database client. Exports a proxy that resolves to either:
// - the Supabase client (when VITE_DB_MODE is "supabase" or unset), or
// - a SQLite client (when VITE_DB_MODE is "sqlite") — runs entirely in the
//   browser via sql.js (WASM), data persists in IndexedDB, no internet needed.

type Client = any;
let _client: Client | null = null;
let _initPromise: Promise<Client> | null = null;

function initClient(): Promise<Client> {
  if (_client) return Promise.resolve(_client);
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    let c: Client;
    if (IS_SQLITE) {
      const mod = await import('./sqlite-client');
      c = await mod.createSqliteClient();
    } else {
      const mod = await import('./supabase');
      c = mod.supabase;
    }
    _client = c;
    return c;
  })();
  return _initPromise;
}

const _ready = initClient();

function makeProxy(path: PropertyKey[] = []): any {
  const fn = function (...args: any[]) {
    return _ready.then((c) => {
      let target: any = c;
      for (const p of path) target = target[p];
      return typeof target === 'function' ? target(...args) : target;
    });
  };
  (fn as any).then = function (onFulfilled: any, onRejected?: any) {
    return _ready.then((c) => {
      if (path.length === 0) return onFulfilled ? onFulfilled(c) : c;
      let target: any = c;
      for (const p of path) target = target[p];
      return onFulfilled ? onFulfilled(target) : target;
    }, onRejected);
  };
  return new Proxy(fn, {
    get(_t, prop: PropertyKey) {
      if (prop === 'then') return (fn as any).then;
      return makeProxy([...path, prop]);
    },
    apply(_t, _thisArg, args) {
      return _ready.then((c) => {
        let target: any = c;
        for (const p of path) target = target[p];
        return typeof target === 'function' ? target(...args) : target;
      });
    },
  });
}

export const supabase = makeProxy();
export const db = supabase;
