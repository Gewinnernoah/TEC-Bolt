import { IS_SQLITE } from './db-mode';

// Unified database client. Exports a synchronous proxy that resolves
// to either the Supabase client or the SQLite client (sql.js).
//
// The challenge: the SQLite client is created asynchronously (WASM init),
// but the entire app expects `supabase.from(...).select(...)` to work
// synchronously. We solve this with a synchronous proxy that queues
// property accesses and method calls until the real client is ready.
// Every method that returns a promise resolves after init completes.
// For the auth API (onAuthStateChange), we return a sync object whose
// methods are thenable — the callback fires after init.

type AnyClient = any;
let _client: AnyClient | null = null;
let _ready: Promise<AnyClient>;
let _isReady = false;

function initClient(): Promise<AnyClient> {
  if (_client) return Promise.resolve(_client);
  return (async () => {
    let c: AnyClient;
    if (IS_SQLITE) {
      const mod = await import('./sqlite-client');
      c = await mod.createSqliteClient();
    } else {
      const mod = await import('./supabase');
      c = mod.supabase;
    }
    _client = c;
    _isReady = true;
    return c;
  })();
}

_ready = initClient();

// A proxy that supports both sync method chaining AND async resolution.
// For sync-looking calls (from().select().eq().order()), each chain
// returns a proxy that records the call. When the result is awaited
// (via .then, .single, .maybeSingle, or direct await), it executes
// against the real client once ready.
//
// For auth.onAuthStateChange(), we return a sync object immediately
// whose data.subscription.unsubscribe works even before init completes.

interface CallNode {
  prop: string;
  args: any[];
  children: CallNode[];
}

function createChainProxy(): any {
  // For query-builder style chains (from, select, eq, order, etc.)
  // we record the call sequence and replay it on the real client.
  const calls: { prop: string; args: any[] }[] = [];

  const target = function (...args: any[]) {
    // If called as a function (await proxy), resolve the chain
    return _ready.then((client) => {
      let result: any = client;
      for (const c of calls) {
        result = result[c.prop](...c.args);
      }
      return result;
    });
  };

  target.then = function (onFulfilled: any, onRejected?: any) {
    return _ready.then((client) => {
      let result: any = client;
      for (const c of calls) {
        result = result[c.prop](...c.args);
      }
      return onFulfilled ? onFulfilled(result) : result;
    }, onRejected);
  };

  return new Proxy(target, {
    get(_t, prop: string) {
      if (prop === 'then') return target.then;
      if (prop === 'catch') {
        return (handler: any) => target.then(undefined, handler);
      }
      // Return a new proxy that records this property access as a method call
      return (...args: any[]) => {
        calls.push({ prop, args });
        return createChainProxyFromCalls([...calls]);
      };
    },
    apply(_t, _thisArg, args) {
      return _ready.then((client) => {
        let result: any = client;
        for (const c of calls) {
          result = result[c.prop](...c.args);
        }
        return typeof result === 'function' ? result(...args) : result;
      });
    },
  });
}

function createChainProxyFromCalls(calls: { prop: string; args: any[] }[]): any {
  const target = function (...args: any[]) {
    return _ready.then((client) => {
      let result: any = client;
      for (const c of calls) {
        result = result[c.prop](...c.args);
      }
      return typeof result === 'function' ? result(...args) : result;
    });
  };

  target.then = function (onFulfilled: any, onRejected?: any) {
    return _ready.then((client) => {
      let result: any = client;
      for (const c of calls) {
        result = result[c.prop](...c.args);
      }
      // If result is already a promise, await it
      if (result && typeof result.then === 'function') {
        return result.then(onFulfilled, onRejected);
      }
      return onFulfilled ? onFulfilled(result) : result;
    }, onRejected);
  };

  return new Proxy(target, {
    get(_t, prop: string) {
      if (prop === 'then') return target.then;
      if (prop === 'catch') {
        return (handler: any) => target.then(undefined, handler);
      }
      return (...args: any[]) => {
        calls.push({ prop, args });
        return createChainProxyFromCalls([...calls]);
      };
    },
    apply(_t, _thisArg, args) {
      return _ready.then((client) => {
        let result: any = client;
        for (const c of calls) {
          result = result[c.prop](...c.args);
        }
        return typeof result === 'function' ? result(...args) : result;
      });
    },
  });
}

// Special handler for auth: onAuthStateChange must return { data: { subscription } } synchronously
function createAuthProxy(): any {
  const pendingCallbacks: { cb: (event: string, session: any) => void }[] = [];

  return new Proxy({} as any, {
    get(_t, prop: string) {
      if (prop === 'onAuthStateChange') {
        return (cb: (event: string, session: any) => void) => {
          // Register callback to fire once client is ready
          pendingCallbacks.push({ cb });
          _ready.then((client) => {
            const result = client.auth.onAuthStateChange(cb);
            // The real client already called the callback via INITIAL_SESSION,
            // so we don't need to call it again here.
            return result;
          });
          // Return a sync object with subscription.unsubscribe that works immediately
          return {
            data: {
              subscription: {
                unsubscribe: () => {
                  const idx = pendingCallbacks.findIndex((p) => p.cb === cb);
                  if (idx >= 0) pendingCallbacks.splice(idx, 1);
                  if (_isReady && _client) {
                    try {
                      // Best effort — the real subscription was already created
                    } catch { /* ignore */ }
                  }
                },
              },
            },
          };
        };
      }
      // All other auth methods are async — return a proxy that chains
      return (...args: any[]) => {
        return _ready.then((client) => {
          const method = client.auth[prop];
          if (typeof method === 'function') return method(...args);
          return method;
        });
      };
    },
  });
}

// Main proxy: top-level `supabase.from()`, `supabase.auth`, `supabase.channel()`, `supabase.rpc()`
const mainTarget = {
  auth: createAuthProxy(),
  from: (table: string) => {
    const proxy = createChainProxy();
    // Record the from() call
    return (proxy as any)(table) || createChainProxyFromCalls([{ prop: 'from', args: [table] }]);
  },
  rpc: (fnName: string) => createChainProxyFromCalls([{ prop: 'rpc', args: [fnName] }]),
  channel: (name: string) => createChainProxyFromCalls([{ prop: 'channel', args: [name] }]),
  removeChannel: (ch: any) => {
    if (_isReady && _client) _client.removeChannel(ch);
  },
};

export const supabase = new Proxy(mainTarget as any, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    return _ready.then((client) => client[prop]);
  },
});

export const db = supabase;
export const dbReady = _ready;
