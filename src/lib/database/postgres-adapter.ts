// Browser adapter for the local PostgreSQL server.
// Mimics the Supabase JS client API (from().select().eq().order().insert().upsert().delete(),
// single(), maybeSingle(), auth.*, rpc()) by translating to HTTP calls against the local API server.

const API_URL = import.meta.env.VITE_POSTGRES_API_URL || 'http://localhost:3456';

type Row = Record<string, any>;
type PostgrestError = { message: string; code?: string; details?: string };
type DbResult<T = any> = { data: T | null; error: PostgrestError | null };

// ---------- Token storage ----------
function getToken(): string | null {
  try { return localStorage.getItem('pg_auth_token'); } catch { return null; }
}
function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem('pg_auth_token', token);
    else localStorage.removeItem('pg_auth_token');
  } catch { /* ignore */ }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------- HTTP helper ----------
async function apiPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) return { error: { message: data.error || 'Request failed' } };
  return data;
}

async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'GET',
    headers: { ...authHeaders() },
  });
  const data = await res.json();
  if (!res.ok) return { error: { message: data.error || 'Request failed' } };
  return data;
}

async function apiDelete(path: string): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: { message: data.error || 'Request failed' } };
  return data;
}

// ---------- Query Builder ----------
class QueryBuilder<T = Row> {
  private _table: string;
  private _select: string | null = null;
  private _where: { column: string; value: any }[] = [];
  private _order: { column: string; ascending: boolean } | null = null;
  private _limit: number | null = null;
  private _insertData: Row | Row[] | null = null;
  private _updateData: Row | null = null;
  private _isDelete = false;
  private _expectSingle = false;
  private _expectMaybeSingle = false;

  constructor(table: string) { this._table = table; }

  select(columns: string = '*'): this { this._select = columns; return this; }

  eq(column: string, value: unknown): this { this._where.push({ column, value }); return this; }
  neq(column: string, value: unknown): this { this._where.push({ column, value: `${value}!neq` }); return this; }
  gt(column: string, value: unknown): this { this._where.push({ column, value: `${value}!gt` }); return this; }
  lt(column: string, value: unknown): this { this._where.push({ column, value: `${value}!lt` }); return this; }
  gte(column: string, value: unknown): this { this._where.push({ column, value: `${value}!gte` }); return this; }
  lte(column: string, value: unknown): this { this._where.push({ column, value: `${value}!lte` }); return this; }

  like(column: string, pattern: string): this { this._where.push({ column, value: `${pattern}!like` }); return this; }
  ilike(column: string, pattern: string): this { this._where.push({ column, value: `${pattern}!ilike` }); return this; }

  in(column: string, values: unknown[]): this { this._where.push({ column, value: `${values.join(',')}!in` }); return this; }
  is(column: string, value: unknown): this { this._where.push({ column, value: value === null ? 'null!is' : `${value}!is` }); return this; }
  not(column: string, _op: string, value: unknown): this { this._where.push({ column, value: `${value}!not` }); return this; }
  or(_filter: string): this { return this; }
  contains(_column: string, _value: unknown): this { return this; }

  order(column: string, opts?: { ascending?: boolean }): this {
    this._order = { column, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(n: number): this { this._limit = n; return this; }
  range(from: number, to: number): this { this._limit = to - from + 1; return this; }

  insert(data: Row | Row[]): this { this._insertData = data; return this; }
  update(data: Row): this { this._updateData = data; return this; }
  delete(): this { this._isDelete = true; return this; }
  upsert(data: Row): this { this._insertData = data; return this; }

  single(): Promise<DbResult<T>> { this._expectSingle = true; return this._execute() as Promise<DbResult<T>>; }
  maybeSingle(): Promise<DbResult<T>> { this._expectMaybeSingle = true; return this._execute() as Promise<DbResult<T>>; }

  private async _execute(): Promise<DbResult> {
    try {
      if (this._insertData) return await this._execInsert();
      if (this._updateData) return await this._execUpdate();
      if (this._isDelete) return await this._execDelete();
      return await this._execSelect();
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? 'Database error' } };
    }
  }

  private _buildFilters(): Record<string, any> {
    const filters: Record<string, any> = {};
    for (const w of this._where) {
      if (typeof w.value === 'string' && w.value.includes('!')) {
        const parts = w.value.split('!');
        const val = parts[0];
        const op = parts[1];
        if (op === 'neq') filters[`${w.column}__neq`] = val;
        else if (op === 'gt') filters[`${w.column}__gt`] = val;
        else if (op === 'lt') filters[`${w.column}__lt`] = val;
        else if (op === 'gte') filters[`${w.column}__gte`] = val;
        else if (op === 'lte') filters[`${w.column}__lte`] = val;
        else if (op === 'like') filters[`${w.column}__like`] = val;
        else if (op === 'ilike') filters[`${w.column}__ilike`] = val;
        else if (op === 'in') filters[`${w.column}__in`] = val;
        else if (op === 'is') filters[`${w.column}__is`] = val;
        else if (op === 'not') filters[`${w.column}__neq`] = val;
        else filters[w.column] = w.value;
      } else {
        filters[w.column] = w.value;
      }
    }
    return filters;
  }

  private async _execSelect(): Promise<DbResult> {
    const filters = this._buildFilters();
    const queryParams = new URLSearchParams();
    queryParams.set('filters', JSON.stringify(filters));
    if (this._order) queryParams.set('order', JSON.stringify(this._order));
    if (this._limit) queryParams.set('limit', String(this._limit));

    const result = await apiGet(`/api/${this._table}?${queryParams.toString()}`);
    if (result.error) return { data: null, error: result.error };

    let docs = result.data || [];
    if (this._expectSingle || this._expectMaybeSingle) {
      if (docs.length === 0) {
        if (this._expectMaybeSingle) return { data: null, error: null };
        return { data: null, error: { message: 'No rows found' } };
      }
      return { data: docs[0], error: null };
    }
    return { data: docs, error: null };
  }

  private async _execInsert(): Promise<DbResult> {
    const dataArr = Array.isArray(this._insertData) ? this._insertData : [this._insertData!];
    const results: Row[] = [];
    for (const input of dataArr) {
      const row: Row = {};
      for (const [k, v] of Object.entries(input)) {
        if (v !== undefined) row[k] = v;
      }
      const result = await apiPost(`/api/${this._table}`, row);
      if (result.error) return { data: null, error: result.error };
      results.push(result.data || row);
    }
    if (this._expectSingle || this._expectMaybeSingle) return { data: results[0] ?? null, error: null };
    return { data: results, error: null };
  }

  private async _execUpdate(): Promise<DbResult> {
    const filters = this._buildFilters();
    const idFilter = filters.id || Object.values(filters)[0];
    const updateData = { ...this._updateData!, updated_at: new Date().toISOString() };

    // Find the record first if we don't have an id
    let targetId = filters.id;
    if (!targetId) {
      const selectResult = await apiGet(`/api/${this._table}?filters=${encodeURIComponent(JSON.stringify(filters))}&limit=1`);
      if (selectResult.error) return { data: null, error: selectResult.error };
      if (selectResult.data && selectResult.data.length > 0) targetId = selectResult.data[0].id;
    }

    if (!targetId) return { data: null, error: { message: 'No matching record to update' } };

    const result = await apiPost(`/api/${this._table}/${targetId}`, updateData);
    if (result.error) return { data: null, error: result.error };
    return { data: result.data, error: null };
  }

  private async _execDelete(): Promise<DbResult> {
    const filters = this._buildFilters();
    let targetId = filters.id;
    if (!targetId) {
      const selectResult = await apiGet(`/api/${this._table}?filters=${encodeURIComponent(JSON.stringify(filters))}&limit=1`);
      if (selectResult.error) return { data: null, error: selectResult.error };
      if (selectResult.data && selectResult.data.length > 0) targetId = selectResult.data[0].id;
    }
    if (!targetId) return { data: null, error: null };
    const result = await apiDelete(`/api/${this._table}/${targetId}`);
    if (result.error) return { data: null, error: result.error };
    return { data: null, error: null };
  }

  then(onFulfilled: any, onRejected?: any) {
    return Promise.resolve(this._execute()).then(onFulfilled, onRejected);
  }
}

// ---------- RPC ----------
class RpcBuilder {
  private _fnName: string;
  constructor(fnName: string) { this._fnName = fnName; }
  single(): Promise<DbResult> { return this._execute(); }
  private async _execute(): Promise<DbResult> {
    const result = await apiPost('/api/rpc', { fn: this._fnName });
    if (result.error) return { data: null, error: result.error };
    return { data: result.result, error: null };
  }
  then(onFulfilled: any, onRejected?: any) { return this._execute().then(onFulfilled, onRejected); }
}

// ---------- Realtime stub ----------
class FakeChannel {
  callback: (() => void) | null = null;
  intervalId: ReturnType<typeof setInterval> | null = null;
  on(_event: string, _filter: any, cb: () => void): this { this.callback = cb; return this; }
  subscribe(): this {
    if (this.callback) this.intervalId = setInterval(this.callback, 10_000);
    return this;
  }
  unsubscribe(): void { if (this.intervalId) clearInterval(this.intervalId); }
}

// ---------- Auth ----------
class PgAuth {
  private listeners: ((event: string, session: any) => void)[] = [];

  private notify(event: string, session: any) {
    for (const l of this.listeners) { try { l(event, session); } catch { /* ignore */ } }
  }

  async getSession(): Promise<DbResult<any>> {
    const token = getToken();
    if (!token) return { data: { session: null }, error: null };
    const result = await apiGet('/api/auth/session');
    if (result.error) return { data: { session: null }, error: result.error };
    return { data: { session: result.session }, error: null };
  }

  async getUser(): Promise<DbResult<any>> {
    const { data } = await this.getSession();
    if (!data.session) return { data: { user: null }, error: null };
    return { data: { user: data.session.user }, error: null };
  }

  async signInWithPassword({ email, password }: { email: string; password: string }): Promise<DbResult<any>> {
    const result = await apiPost('/api/auth/signin', { email, password });
    if (result.error) return { data: { user: null, session: null }, error: result.error };
    setToken(result.session.access_token);
    this.notify('SIGNED_IN', result.session);
    return { data: result, error: null };
  }

  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, any> } }): Promise<DbResult<any>> {
    const result = await apiPost('/api/auth/signup', {
      email,
      password,
      full_name: options?.data?.full_name,
    });
    if (result.error) return { data: { user: null, session: null }, error: result.error };
    // Account is locked — no session returned. Don't set token.
    if (result.session?.access_token) {
      setToken(result.session.access_token);
      this.notify('SIGNED_IN', result.session);
    }
    return { data: result, error: null };
  }

  async signOut(): Promise<{ error: any }> {
    await apiPost('/api/auth/signout', {});
    setToken(null);
    this.notify('SIGNED_OUT', null);
    return { error: null };
  }

  async resetPasswordForEmail(_email: string): Promise<DbResult> {
    return { data: {}, error: null };
  }

  onAuthStateChange(callback: (event: string, session: any) => void) {
    this.listeners.push(callback);
    this.getSession().then(({ data }: any) => callback('INITIAL_SESSION', data.session));
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            const idx = this.listeners.indexOf(callback);
            if (idx >= 0) this.listeners.splice(idx, 1);
          },
        },
      },
    };
  }
}

// ---------- Main client ----------
class PgClient {
  auth: PgAuth;

  constructor() { this.auth = new PgAuth(); }

  from(table: string): QueryBuilder { return new QueryBuilder(table); }
  rpc(fnName: string): RpcBuilder { return new RpcBuilder(fnName); }
  channel(_name: string): FakeChannel { return new FakeChannel(); }
  removeChannel(ch: FakeChannel): void { ch.unsubscribe(); }
}

export async function createPostgresClient(): Promise<PgClient> {
  const client = new PgClient();
  return client;
}
