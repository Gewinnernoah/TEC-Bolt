import { IS_PGLITE } from './db-mode';

// Unified database client. Exports a proxy that resolves to either:
// - the Supabase client (when VITE_DB_MODE is "supabase" or unset), or
// - a local PGlite client (when VITE_DB_MODE is "pglite")
//
// All app code imports { supabase } from '@/lib/db'. Because the client
// is created asynchronously, we export a thenable proxy that defers
// property access until the underlying client is ready.

type Client = any;
let _client: Client | null = null;
let _initPromise: Promise<Client> | null = null;

function initClient(): Promise<Client> {
  if (_client) return Promise.resolve(_client);
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    let c: Client;
    if (IS_PGLITE) {
      const mod = await import('./pglite-client');
      c = await mod.createPGliteClient();
    } else {
      const mod = await import('./supabase');
      c = mod.supabase;
    }
    _client = c;
    return c;
  })();
  return _initPromise;
}

// Start initialization immediately
const _ready = initClient();

// Create a thenable proxy so `await supabase` and `supabase.from(...)` both work.
// Property access returns sub-proxies that queue the call until the client is ready.

function makeProxy(path: PropertyKey[] = []): any {
  const fn = function (...args: any[]) {
    return _ready.then((c) => {
      let target: any = c;
      for (const p of path) target = target[p];
      return typeof target === 'function' ? target(...args) : target;
    });
  };
  // Make the proxy thenable so `await supabase` resolves to the client
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
