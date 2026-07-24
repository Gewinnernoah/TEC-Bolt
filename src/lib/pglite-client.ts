import { getDb } from './pglite-instance';

// ---------- Types ----------

interface QueryResult<T> { data: T | null; error: { message: string } | null; }
interface PostgrestError { message: string; }

type Row = Record<string, unknown>;
type Value = string | number | boolean | null | unknown;

// ---------- Query Builder ----------

class QueryBuilder<T = Row> {
  private _table: string;
  private _select: string | null = null;
  private _filters: string[] = [];
  private _order: { column: string; ascending: boolean } | null = null;
  private _limit: number | null = null;
  private _insertData: Row | Row[] | null = null;
  private _updateData: Row | null = null;
  private _isDelete = false;
  private _isUpsert = false;
  private _expectSingle = false;
  private _expectMaybeSingle = false;

  constructor(table: string) { this._table = table; }

  select(columns: string = '*'): this & { data: T[] | null; error: PostgrestError | null } {
    this._select = columns;
    return this as any;
  }

  eq(column: string, value: Value): this {
    this._filters.push(`${column} = ${this.escape(value)}`);
    return this;
  }

  neq(column: string, value: Value): this {
    this._filters.push(`${column} <> ${this.escape(value)}`);
    return this;
  }

  gt(column: string, value: Value): this {
    this._filters.push(`${column} > ${this.escape(value)}`);
    return this;
  }

  lt(column: string, value: Value): this {
    this._filters.push(`${column} < ${this.escape(value)}`);
    return this;
  }

  gte(column: string, value: Value): this {
    this._filters.push(`${column} >= ${this.escape(value)}`);
    return this;
  }

  lte(column: string, value: Value): this {
    this._filters.push(`${column} <= ${this.escape(value)}`);
    return this;
  }

  like(column: string, pattern: string): this {
    this._filters.push(`${column} LIKE ${this.escape(pattern)}`);
    return this;
  }

  ilike(column: string, pattern: string): this {
    this._filters.push(`${column} ILIKE ${this.escape(pattern)}`);
    return this;
  }

  in(column: string, values: Value[]): this {
    const list = values.map((v) => this.escape(v)).join(',');
    this._filters.push(`${column} IN (${list})`);
    return this;
  }

  is(column: string, value: Value): this {
    if (value === null) this._filters.push(`${column} IS NULL`);
    else this._filters.push(`${column} IS ${this.escape(value)}`);
    return this;
  }

  not(column: string, _op: string, value: Value): this {
    this._filters.push(`NOT ${column} = ${this.escape(value)}`);
    return this;
  }

  or(filter: string): this {
    this._filters.push(`(${filter.replace(/\./g, ' ').replace(/,(?=[^)]*(?:\(|$))/g, ' OR ')})`);
    return this;
  }

  contains(column: string, value: Value): this {
    this._filters.push(`${column} @> ${this.escape(JSON.stringify(value))}`);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this._order = { column, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  range(from: number, to: number): this {
    this._limit = to - from + 1;
    return this;
  }

  insert(data: Row | Row[]): this {
    this._insertData = data;
    return this;
  }

  update(data: Row): this {
    this._updateData = data;
    return this;
  }

  delete(): this {
    this._isDelete = true;
    return this;
  }

  upsert(data: Row): this {
    this._insertData = data;
    this._isUpsert = true;
    return this;
  }

  single(): Promise<QueryResult<T>> { this._expectSingle = true; return this._execute() as Promise<QueryResult<T>>; }
  maybeSingle(): Promise<QueryResult<T>> { this._expectMaybeSingle = true; return this._execute() as Promise<QueryResult<T>>; }

  private escape(v: Value): string {
    if (v === null) return 'NULL';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    const s = String(v).replace(/'/g, "''");
    return `'${s}'`;
  }

  // Parse PostgREST select string into SQL column list + join clauses
  private parseSelect(): { sql: string; joins: string[] } {
    if (!this._select || this._select === '*') return { sql: '*', joins: [] };

    const joins: string[] = [];
    const cols: string[] = [];
    const parts = this._select.split(/,(?![^()]*\))/);

    for (const part of parts) {
      const trimmed = part.trim();
      const match = trimmed.match(/^(\w+):(\w+)(?:!(\w+_fkey))?\((.*)\)$/);
      if (match) {
        const alias = match[1];
        const fkTable = match[2];
        const innerSelect = match[4];
        joins.push({ alias, fkTable, innerSelect } as any);
      } else {
        cols.push(trimmed);
      }
    }

    return { sql: cols.join(', ') || '*', joins };
  }

  private async _execute(): Promise<{ data: any; error: PostgrestError | null }> {
    try {
      const db = await getDb();

      if (this._insertData) {
        return await this._execInsert(db);
      } else if (this._updateData) {
        return await this._execUpdate(db);
      } else if (this._isDelete) {
        return await this._execDelete(db);
      } else {
        return await this._execSelect(db);
      }
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? 'Database error' } };
    }
  }

  private async _execSelect(db: any): Promise<{ data: any; error: PostgrestError | null }> {
    const { sql, joins } = this.parseSelect();
    let query = `SELECT ${sql} FROM ${this._table}`;

    if (joins.length > 0) {
      // We need to fetch base rows then do nested joins in JS
      return await this._execSelectWithJoins(db, joins);
    }

    if (this._filters.length > 0) query += ` WHERE ${this._filters.join(' AND ')}`;
    if (this._order) query += ` ORDER BY ${this._order.column} ${this._order.ascending ? 'ASC' : 'DESC'}`;
    if (this._limit !== null) query += ` LIMIT ${this._limit}`;

    const result = await db.query(query);
    let rows = result.rows as any[];

    if (this._expectSingle || this._expectMaybeSingle) {
      if (rows.length === 0) {
        if (this._expectMaybeSingle) return { data: null, error: null };
        return { data: null, error: { message: 'No rows found' } };
      }
      return { data: this.normalizeRow(rows[0], this._table), error: null };
    }
    return { data: rows.map((r) => this.normalizeRow(r, this._table)), error: null };
  }

  private async _execSelectWithJoins(db: any, joins: any[]): Promise<{ data: any; error: PostgrestError | null }> {
    // Fetch base table rows
    let query = `SELECT * FROM ${this._table}`;
    if (this._filters.length > 0) query += ` WHERE ${this._filters.join(' AND ')}`;
    if (this._order) query += ` ORDER BY ${this._order.column} ${this._order.ascending ? 'ASC' : 'DESC'}`;
    if (this._limit !== null) query += ` LIMIT ${this._limit}`;

    const result = await db.query(query);
    let rows = result.rows as any[];

    // For each join, fetch related data
    for (const row of rows) {
      for (const join of joins) {
        const { alias, fkTable, innerSelect } = join;
        // Determine the FK column: convention is <alias>_id in the current table pointing to fkTable
        const fkCol = `${alias}_id`;
        const fkValue = row[fkCol];

        if (fkValue == null) {
          row[alias] = null;
          continue;
        }

        if (innerSelect === '*') {
          const subResult = await db.query(`SELECT * FROM ${fkTable} WHERE id = $1`, [fkValue]);
          if (subResult.rows.length > 0) {
            row[alias] = this.normalizeRow(subResult.rows[0], fkTable);
          } else {
            row[alias] = null;
          }
        } else {
          // Nested join in inner select (e.g., items:lending_loan_items(*, device:devices(*)))
          const subResult = await db.query(`SELECT * FROM ${fkTable} WHERE ${this._findFkColumn(fkTable, this._table)} = $1`, [fkValue]);
          // Recursively process inner joins
          row[alias] = subResult.rows.map((r: any) => this.normalizeRow(r, fkTable));
        }
      }
    }

    if (this._expectSingle || this._expectMaybeSingle) {
      if (rows.length === 0) {
        if (this._expectMaybeSingle) return { data: null, error: null };
        return { data: null, error: { message: 'No rows found' } };
      }
      return { data: rows[0], error: null };
    }
    return { data: rows, error: null };
  }

  private _findFkColumn(fkTable: string, parentTable: string): string {
    // Common convention: <parent_singular>_id
    const singular = parentTable.replace(/s$/, '');
    return `${singular}_id`;
  }

  private async _execInsert(db: any): Promise<{ data: any; error: PostgrestError | null }> {
    const dataArr = Array.isArray(this._insertData) ? this._insertData : [this._insertData];
    const results: any[] = [];

    for (const row of dataArr) {
      const keys = Object.keys(row);
      const values = keys.map((_, i) => `$${i + 1}`);
      const params = keys.map((k) => this.serializeValue(row[k]));

      let query: string;
      if (this._isUpsert) {
        const updateCols = keys.filter((k) => k !== 'id').map((k) => `${k} = EXCLUDED.${k}`).join(', ');
        query = `INSERT INTO ${this._table} (${keys.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO UPDATE SET ${updateCols} RETURNING *`;
        if (keys.length === 1 && keys[0] !== 'id') {
          // upsert by non-id key (e.g. system_settings key)
          const conflictCol = keys[0];
          const updateCols2 = keys.filter((k) => k !== conflictCol).map((k) => `${k} = EXCLUDED.${k}`).join(', ');
          query = `INSERT INTO ${this._table} (${keys.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateCols2 || `${conflictCol} = EXCLUDED.${conflictCol}`} RETURNING *`;
        }
      } else {
        query = `INSERT INTO ${this._table} (${keys.join(', ')}) VALUES (${values.join(', ')}) RETURNING *`;
      }

      const result = await db.query(query, params);
      results.push(this.normalizeRow(result.rows[0], this._table));
    }

    if (this._expectSingle || this._expectMaybeSingle) {
      return { data: results[0] ?? null, error: null };
    }
    return { data: results, error: null };
  }

  private async _execUpdate(db: any): Promise<{ data: any; error: PostgrestError | null }> {
    const keys = Object.keys(this._updateData!);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const params = keys.map((k) => this.serializeValue((this._updateData as Row)[k]));

    let query = `UPDATE ${this._table} SET ${setClause}`;
    if (this._filters.length > 0) query += ` WHERE ${this._filters.join(' AND ')}`;
    query += ' RETURNING *';

    const result = await db.query(query, params);
    const rows = result.rows.map((r: any) => this.normalizeRow(r, this._table));

    if (this._expectSingle || this._expectMaybeSingle) {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  private async _execDelete(db: any): Promise<{ data: any; error: PostgrestError | null }> {
    let query = `DELETE FROM ${this._table}`;
    if (this._filters.length > 0) query += ` WHERE ${this._filters.join(' AND ')}`;
    query += ' RETURNING *';

    const result = await db.query(query);
    const rows = result.rows.map((r: any) => this.normalizeRow(r, this._table));

    if (this._expectSingle || this._expectMaybeSingle) {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  private serializeValue(v: unknown): unknown {
    if (v === undefined) return null;
    if (Array.isArray(v) || (typeof v === 'object' && v !== null)) return JSON.stringify(v);
    return v;
  }

  private normalizeRow(row: any, _table: string): any {
    if (!row) return row;
    const out: any = {};
    for (const key of Object.keys(row)) {
      let val = row[key];
      // PGlite returns bigint as string sometimes; normalize numeric fields
      if (typeof val === 'bigint') val = Number(val);
      out[key] = val;
    }
    return out;
  }

  // Make the builder thenable
  then(onFulfilled: any, onRejected?: any) {
    return this._execute().then(onFulfilled, onRejected);
  }
}

// ---------- RPC ----------

class RpcBuilder {
  private _fnName: string;
  private _args: Record<string, unknown> = {};

  constructor(fnName: string) { this._fnName = fnName; }

  single(): Promise<QueryResult<Row>> { return this._execute() as Promise<QueryResult<Row>>; }

  private async _execute(): Promise<{ data: any; error: PostgrestError | null }> {
    try {
      const db = await getDb();
      if (this._fnName === 'generate_ticket_number') {
        const result = await db.query("SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 3) AS int)), 0) + 1 AS next_num FROM tickets");
        const nextNum = result.rows[0].next_num;
        const ticketNumber = 'TK' + String(nextNum).padStart(5, '0');
        return { data: { generate_ticket_number: ticketNumber } as any, error: null };
      }
      return { data: null, error: { message: `Unknown RPC: ${this._fnName}` } };
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? 'RPC error' } };
    }
  }

  then(onFulfilled: any, onRejected?: any) { return this._execute().then(onFulfilled, onRejected); }
}

// ---------- Channel (realtime stub for PGlite mode) ----------

class FakeChannel {
  callback: (() => void) | null = null;
  on(_event: string, _filter: any, cb: () => void): this { this.callback = cb; return this; }
  subscribe(): this { return this; }
  unsubscribe(): void { /* no-op */ }
}

// ---------- Main PGlite client ----------

class PGliteClient {
  auth: any;
  channel(_name: string): FakeChannel { return new FakeChannel(); }
  removeChannel(_ch: FakeChannel): void { /* no-op */ }

  from(table: string): QueryBuilder { return new QueryBuilder(table); }

  rpc(fnName: string): RpcBuilder { return new RpcBuilder(fnName); }
}

export async function createPGliteClient(): Promise<PGliteClient> {
  const client = new PGliteClient();
  client.auth = await createPGliteAuth();
  return client;
}

// ---------- PGlite Auth (local password store) ----------

import { hashPassword, verifyPassword, generateToken } from './pglite-auth';

async function createPGliteAuth(): Promise<any> {
  const db = await getDb();

  // Ensure auth tables exist
  await db.query(`
    CREATE TABLE IF NOT EXISTS local_auth_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS local_auth_sessions (
      token text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES local_auth_users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    );
  `);

  let sessionToken: string | null = null;
  let cachedUser: { id: string; email: string } | null = null;
  const listeners: ((event: string, session: any) => void)[] = [];

  function notify(event: string, session: any) {
    for (const l of listeners) l(event, session);
  }

  async function getSession() {
    if (!sessionToken) return { data: { session: null }, error: null };
    const result = await db.query(
      `SELECT u.id, u.email, s.expires_at FROM local_auth_sessions s
       JOIN local_auth_users u ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > now()`, [sessionToken]
    );
    if (result.rows.length === 0) {
      sessionToken = null;
      return { data: { session: null }, error: null };
    }
    const row = result.rows[0];
    return {
      data: {
        session: {
          access_token: sessionToken,
          user: { id: row.id, email: row.email },
          expires_at: new Date(row.expires_at).getTime() / 1000,
        }
      }, error: null
    };
  }

  async function getUser() {
    const { data } = await getSession();
    if (!data.session) return { data: { user: null }, error: null };
    return { data: { user: data.session.user }, error: null };
  }

  async function signInWithPassword({ email, password }: { email: string; password: string }) {
    const result = await db.query(
      'SELECT id, email, password_hash FROM local_auth_users WHERE email = $1', [email]
    );
    if (result.rows.length === 0) {
      return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
    }
    const row = result.rows[0];
    const valid = await verifyPassword(password, row.password_hash);
    if (!valid) {
      return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
    }

    sessionToken = generateToken();
    cachedUser = { id: row.id, email: row.email };
    await db.query(
      'INSERT INTO local_auth_sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval \'30 days\')',
      [sessionToken, row.id]
    );

    const session = {
      access_token: sessionToken,
      user: { id: row.id, email: row.email },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    };
    notify('SIGNED_IN', session);
    return { data: { user: session.user, session }, error: null };
  }

  async function signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
    // Check if user exists
    const existing = await db.query('SELECT id FROM local_auth_users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return { data: { user: null, session: null }, error: { message: 'User already registered' } };
    }

    const hash = await hashPassword(password);
    const fullName = (options?.data?.full_name as string) || email.split('@')[0];
    const role = (options?.data?.role as string) || 'teacher';

    const userResult = await db.query(
      'INSERT INTO local_auth_users (email, password_hash) VALUES ($1, $2) RETURNING id', [email, hash]
    );
    const userId = userResult.rows[0].id;

    // Create profile
    await db.query(
      `INSERT INTO profiles (id, email, full_name, role) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role`,
      [userId, email, fullName, role]
    );

    sessionToken = generateToken();
    cachedUser = { id: userId, email };
    await db.query(
      'INSERT INTO local_auth_sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval \'30 days\')',
      [sessionToken, userId]
    );

    const session = {
      access_token: sessionToken,
      user: { id: userId, email },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    };
    notify('SIGNED_IN', session);
    return { data: { user: session.user, session }, error: null };
  }

  async function signOut() {
    if (sessionToken) {
      await db.query('DELETE FROM local_auth_sessions WHERE token = $1', [sessionToken]);
    }
    sessionToken = null;
    cachedUser = null;
    notify('SIGNED_OUT', null);
    return { error: null };
  }

  async function resetPasswordForEmail(email: string) {
    // Local mode: check if user exists, return success regardless (security)
    const result = await db.query('SELECT id FROM local_auth_users WHERE email = $1', [email]);
    // In local mode we can't send emails; just don't error
    return { data: {}, error: null };
  }

  function onAuthStateChange(callback: (event: string, session: any) => void) {
    listeners.push(callback);
    // Fire initial state
    getSession().then(({ data }) => callback('INITIAL_SESSION', data.session));
    return {
      subscription: {
        unsubscribe: () => {
          const idx = listeners.indexOf(callback);
          if (idx >= 0) listeners.splice(idx, 1);
        }
      }
    };
  }

  return {
    getSession,
    getUser,
    signInWithPassword,
    signUp,
    signOut,
    resetPasswordForEmail,
    onAuthStateChange,
  };
}

export type { PGliteClient };
