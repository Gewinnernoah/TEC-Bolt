// SQLite client adapter using sql.js (SQLite compiled to WASM).
// Data persists in IndexedDB — no internet connection required.
// Mimics the Supabase PostgREST query-builder + auth + realtime API.

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { SCHEMA_SQL, SEED_SQL, uuid } from './sqlite-schema';

// ---------- IndexedDB persistence ----------
const IDB_DB_NAME = 'techub-sqlite';
const IDB_STORE = 'db';
const IDB_KEY = 'database';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIDB(): Promise<Uint8Array | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result ? new Uint8Array(req.result) : null);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIDB(data: Uint8Array): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(data, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- JSON helpers ----------
function parseJSON<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return val as T;
}

function stringifyForDb(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return JSON.stringify(val);
}

// Normalize a SQLite row: convert integers back to booleans, parse JSON columns
const JSON_COLUMNS = new Set([
  'metadata', 'webauthn_credentials', 'photos', 'installed_technology',
  'available_connections', 'connections', 'speedtest_result', 'ping_result',
  'stage_plan', 'equipment_plan', 'rehearsal_schedule', 'intake_form_data',
  'details', 'tags', 'value',
]);

const BOOL_COLUMNS = new Set([
  'fingerprint_enrolled', 'is_active', 'exempt_auto_logout', 'is_high_value',
  'is_custom', 'is_available', 'is_outage', 'requires_room', 'requires_speedtest',
  'is_enabled', 'is_internal', 'is_completed', 'is_recurring', 'is_read',
]);

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    if (BOOL_COLUMNS.has(key) && val !== null) {
      out[key] = val === 1 || val === '1' || val === true;
    } else if (JSON_COLUMNS.has(key) && typeof val === 'string') {
      out[key] = parseJSON(val, val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

// ---------- Query Builder ----------

type Row = Record<string, unknown>;
type PostgrestError = { message: string };

class QueryBuilder<T = Row> {
  private _table: string;
  private _select: string | null = null;
  private _where: string[] = [];
  private _whereParams: unknown[] = [];
  private _order: { column: string; ascending: boolean } | null = null;
  private _limit: number | null = null;
  private _insertData: Row | Row[] | null = null;
  private _updateData: Row | null = null;
  private _isDelete = false;
  private _isUpsert = false;
  private _expectSingle = false;
  private _expectMaybeSingle = false;
  private _db: Database;
  private _relationships: Map<string, { fkCol: string; target: string; nested: boolean }> = new Map();

  constructor(db: Database, table: string) {
    this._db = db;
    this._table = table;
  }

  select(columns: string = '*'): this {
    this._select = columns;
    this._parseSelect(columns);
    return this;
  }

  private _parseSelect(columns: string): void {
    if (columns === '*') return;
    const parts = columns.split(/,(?![^()]*\))/);
    for (const part of parts) {
      const trimmed = part.trim();
      const match = trimmed.match(/^(\w+):(\w+)\((.*)\)$/);
      if (match) {
        const alias = match[1];
        const target = match[2];
        const inner = match[3];
        const fkCol = `${alias}_id`;
        this._relationships.set(alias, { fkCol, target, nested: inner.includes(':') || inner.includes('*') });
        continue;
      }
      const simpleMatch = trimmed.match(/^(\w+):(\w+)$/);
      if (simpleMatch) {
        const alias = simpleMatch[1];
        const target = simpleMatch[2];
        const fkCol = `${alias}_id`;
        this._relationships.set(alias, { fkCol, target, nested: false });
      }
    }
  }

  // ---- filters ----

  eq(column: string, value: unknown): this {
    this._where.push(`${column} = ?`);
    this._whereParams.push(this._encode(value));
    return this;
  }

  neq(column: string, value: unknown): this {
    this._where.push(`${column} != ?`);
    this._whereParams.push(this._encode(value));
    return this;
  }

  gt(column: string, value: unknown): this {
    this._where.push(`${column} > ?`);
    this._whereParams.push(this._encode(value));
    return this;
  }

  lt(column: string, value: unknown): this {
    this._where.push(`${column} < ?`);
    this._whereParams.push(this._encode(value));
    return this;
  }

  gte(column: string, value: unknown): this {
    this._where.push(`${column} >= ?`);
    this._whereParams.push(this._encode(value));
    return this;
  }

  lte(column: string, value: unknown): this {
    this._where.push(`${column} <= ?`);
    this._whereParams.push(this._encode(value));
    return this;
  }

  like(column: string, pattern: string): this {
    this._where.push(`${column} LIKE ?`);
    this._whereParams.push(pattern);
    return this;
  }

  ilike(column: string, pattern: string): this {
    this._where.push(`LOWER(${column}) LIKE LOWER(?)`);
    this._whereParams.push(pattern);
    return this;
  }

  in(column: string, values: unknown[]): this {
    const placeholders = values.map(() => '?').join(',');
    this._where.push(`${column} IN (${placeholders})`);
    for (const v of values) this._whereParams.push(this._encode(v));
    return this;
  }

  is(column: string, value: unknown): this {
    if (value === null) this._where.push(`${column} IS NULL`);
    else { this._where.push(`${column} = ?`); this._whereParams.push(this._encode(value)); }
    return this;
  }

  not(column: string, _op: string, value: unknown): this {
    this._where.push(`${column} != ?`);
    this._whereParams.push(this._encode(value));
    return this;
  }

  or(_filter: string): this { return this; }

  contains(column: string, value: unknown): this {
    // SQLite doesn't have array containment; use LIKE for simple values
    if (Array.isArray(value)) {
      const conditions = value.map(() => `${column} LIKE ?`).join(' OR ');
      this._where.push(`(${conditions})`);
      for (const v of value) this._whereParams.push(`%"${v}"%`);
    }
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this._order = { column, ascending: opts?.ascending ?? true };
    return this;
  }

  limit(n: number): this { this._limit = n; return this; }

  range(from: number, to: number): this { this._limit = to - from + 1; return this; }

  // ---- mutations ----

  insert(data: Row | Row[]): this { this._insertData = data; return this; }
  update(data: Row): this { this._updateData = data; return this; }
  delete(): this { this._isDelete = true; return this; }
  upsert(data: Row): this { this._insertData = data; this._isUpsert = true; return this; }

  single(): Promise<{ data: T | null; error: PostgrestError | null }> {
    this._expectSingle = true;
    return this._execute() as Promise<{ data: T | null; error: PostgrestError | null }>;
  }

  maybeSingle(): Promise<{ data: T | null; error: PostgrestError | null }> {
    this._expectMaybeSingle = true;
    return this._execute() as Promise<{ data: T | null; error: PostgrestError | null }>;
  }

  // ---- encoding ----

  private _encode(val: unknown): string | null {
    if (val === null || val === undefined) return null;
    if (typeof val === 'boolean') return val ? '1' : '0';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  // ---- execution ----

  private async _execute(): Promise<{ data: unknown; error: PostgrestError | null }> {
    try {
      if (this._insertData) return this._execInsert();
      if (this._updateData) return this._execUpdate();
      if (this._isDelete) return this._execDelete();
      return this._execSelect();
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? 'Database error' } };
    }
  }

  private _execSelect(): { data: unknown; error: PostgrestError | null } {
    let sql = `SELECT * FROM ${this._table}`;
    const params: unknown[] = [];
    if (this._where.length > 0) {
      sql += ` WHERE ${this._where.join(' AND ')}`;
      params.push(...this._whereParams);
    }
    if (this._order) sql += ` ORDER BY ${this._order.column} ${this._order.ascending ? 'ASC' : 'DESC'}`;
    if (this._limit !== null) sql += ` LIMIT ${this._limit}`;

    const stmt = this._db.prepare(sql);
    stmt.bind(params);
    const rows: Row[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as Row);
    stmt.free();

    let docs = rows.map(normalizeRow);

    // Hydrate relationships
    for (const [alias, rel] of this._relationships) {
      if (rel.nested) {
        // Child table references back: <singular>_id
        const singular = this._table.replace(/s$/, '');
        const childFk = `${singular}_id`;
        const parentIds = docs.map((d) => d.id).filter(Boolean) as string[];
        if (parentIds.length === 0) { docs.forEach((d) => (d[alias] = [])); continue; }
        const placeholders = parentIds.map(() => '?').join(',');
        const stmt2 = this._db.prepare(`SELECT * FROM ${rel.target} WHERE ${childFk} IN (${placeholders})`);
        stmt2.bind(parentIds);
        const childRows: Row[] = [];
        while (stmt2.step()) childRows.push(stmt2.getAsObject() as Row);
        stmt2.free();
        const byParent = new Map<string, Row[]>();
        for (const cr of childRows) {
          const nr = normalizeRow(cr);
          const pid = nr[childFk] as string;
          if (!byParent.has(pid)) byParent.set(pid, []);
          byParent.get(pid)!.push(nr);
        }
        for (const doc of docs) doc[alias] = byParent.get(doc.id as string) ?? [];
      } else {
        // FK on this table pointing to parent
        const fkValues = docs.map((d) => d[rel.fkCol]).filter(Boolean) as string[];
        if (fkValues.length === 0) { docs.forEach((d) => (d[alias] = null)); continue; }
        const uniqueFk = [...new Set(fkValues)];
        const placeholders = uniqueFk.map(() => '?').join(',');
        const stmt2 = this._db.prepare(`SELECT * FROM ${rel.target} WHERE id IN (${placeholders})`);
        stmt2.bind(uniqueFk);
        const parentRows: Row[] = [];
        while (stmt2.step()) parentRows.push(stmt2.getAsObject() as Row);
        stmt2.free();
        const byId = new Map<string, Row>();
        for (const pr of parentRows) byId.set(pr.id as string, normalizeRow(pr));
        for (const doc of docs) {
          const fk = doc[rel.fkCol] as string;
          doc[alias] = fk ? (byId.get(fk) ?? null) : null;
        }
      }
    }

    if (this._expectSingle || this._expectMaybeSingle) {
      if (docs.length === 0) {
        if (this._expectMaybeSingle) return { data: null, error: null };
        return { data: null, error: { message: 'No rows found' } };
      }
      return { data: docs[0], error: null };
    }
    return { data: docs, error: null };
  }

  private _execInsert(): { data: unknown; error: PostgrestError | null } {
    const dataArr = Array.isArray(this._insertData) ? this._insertData : [this._insertData!];
    const results: Row[] = [];

    for (const input of dataArr) {
      const row: Row = {};
      for (const [k, v] of Object.entries(input)) {
        if (v === undefined) continue;
        row[k] = v;
      }
      if (!row.id) row.id = uuid();
      if (!row.created_at) row.created_at = new Date().toISOString();
      if (!row.updated_at) row.updated_at = new Date().toISOString();

      if (this._isUpsert) {
        const conflictCol = row.key ? 'key' : row.id ? 'id' : row.email ? 'email' : row.inventory_number ? 'inventory_number' : 'id';
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(',');
        const sql = `INSERT OR REPLACE INTO ${this._table} (${cols.join(',')}) VALUES (${placeholders})`;
        this._db.run(sql, cols.map((c) => this._encode(row[c])));
      } else {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(',');
        const sql = `INSERT INTO ${this._table} (${cols.join(',')}) VALUES (${placeholders})`;
        this._db.run(sql, cols.map((c) => this._encode(row[c])));
      }
      results.push(normalizeRow(row));
    }

    if (this._expectSingle || this._expectMaybeSingle) return { data: results[0] ?? null, error: null };
    return { data: results, error: null };
  }

  private _execUpdate(): { data: unknown; error: PostgrestError | null } {
    const updateData = { ...this._updateData!, updated_at: new Date().toISOString() };
    const cols = Object.keys(updateData);
    const setClause = cols.map((c) => `${c} = ?`).join(',');
    const params = cols.map((c) => this._encode(updateData[c]));

    let sql = `UPDATE ${this._table} SET ${setClause}`;
    if (this._where.length > 0) {
      sql += ` WHERE ${this._where.join(' AND ')}`;
      params.push(...this._whereParams);
    }
    this._db.run(sql, params);

    // Return updated rows
    return this._execSelect();
  }

  private _execDelete(): { data: unknown; error: PostgrestError | null } {
    // Fetch rows before deleting
    const selectResult = this._execSelect();
    const docs = (selectResult.data as Row[]) ?? [];

    let sql = `DELETE FROM ${this._table}`;
    const params: unknown[] = [];
    if (this._where.length > 0) {
      sql += ` WHERE ${this._where.join(' AND ')}`;
      params.push(...this._whereParams);
    }
    this._db.run(sql, params);

    if (this._expectSingle || this._expectMaybeSingle) return { data: docs[0] ?? null, error: null };
    return { data: docs, error: null };
  }

  then(onFulfilled: any, onRejected?: any) {
    return Promise.resolve(this._execute()).then(onFulfilled, onRejected);
  }
}

// ---------- RPC ----------

class RpcBuilder {
  private _fnName: string;
  private _db: Database;

  constructor(db: Database, fnName: string) { this._db = db; this._fnName = fnName; }

  single(): Promise<{ data: unknown; error: PostgrestError | null }> {
    return this._execute();
  }

  private async _execute(): Promise<{ data: unknown; error: PostgrestError | null }> {
    try {
      if (this._fnName === 'generate_ticket_number') {
        const stmt = this._db.prepare("SELECT ticket_number FROM tickets ORDER BY ticket_number DESC LIMIT 1");
        let nextNum = 1;
        if (stmt.step()) {
          const row = stmt.getAsObject() as Row;
          const num = parseInt(String(row.ticket_number).replace(/\D/g, ''), 10);
          if (!isNaN(num)) nextNum = num + 1;
        }
        stmt.free();
        const ticketNumber = 'TK' + String(nextNum).padStart(5, '0');
        return { data: { generate_ticket_number: ticketNumber }, error: null };
      }
      return { data: null, error: { message: `Unknown RPC: ${this._fnName}` } };
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? 'RPC error' } };
    }
  }

  then(onFulfilled: any, onRejected?: any) { return this._execute().then(onFulfilled, onRejected); }
}

// ---------- Realtime stub (polling) ----------

class FakeChannel {
  callback: (() => void) | null = null;
  intervalId: ReturnType<typeof setInterval> | null = null;
  on(_event: string, _filter: any, cb: () => void): this { this.callback = cb; return this; }
  subscribe(): this {
    if (this.callback) this.intervalId = setInterval(this.callback, 10_000);
    return this;
  }
  unsubscribe(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }
}

// ---------- Auth ----------

async function createSqliteAuth(db: Database, persist: () => Promise<void>) {
  let sessionToken: string | null = null;
  const listeners: ((event: string, session: any) => void)[] = [];

  function notify(event: string, session: any) {
    for (const l of listeners) l(event, session);
  }

  async function getSession() {
    if (!sessionToken) return { data: { session: null }, error: null };
    const stmt = db.prepare('SELECT * FROM auth_sessions WHERE token = ? AND expires_at > ? LIMIT 1');
    stmt.bind([sessionToken, new Date().toISOString()]);
    let session: any = null;
    if (stmt.step()) {
      const row = stmt.getAsObject() as Row;
      session = {
        access_token: sessionToken,
        user: { id: row.user_id, email: row.email },
        expires_at: new Date(row.expires_at as string).getTime() / 1000,
      };
    }
    stmt.free();
    return { data: { session }, error: null };
  }

  async function getUser() {
    const { data } = await getSession();
    if (!data.session) return { data: { user: null }, error: null };
    return { data: { user: data.session.user }, error: null };
  }

  async function signInWithPassword({ email, password }: { email: string; password: string }) {
    const stmt = db.prepare('SELECT * FROM auth_users WHERE email = ? LIMIT 1');
    stmt.bind([email]);
    if (!stmt.step()) {
      stmt.free();
      return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
    }
    const row = stmt.getAsObject() as Row;
    stmt.free();
    const valid = await verifyPassword(password, row.password_hash as string);
    if (!valid) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };

    sessionToken = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    db.run('INSERT INTO auth_sessions (id, token, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), sessionToken, row.id, email, expiresAt, new Date().toISOString()]);
    await persist();

    const session = {
      access_token: sessionToken,
      user: { id: row.id, email },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    };
    notify('SIGNED_IN', session);
    return { data: { user: session.user, session }, error: null };
  }

  async function signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
    const checkStmt = db.prepare('SELECT id FROM auth_users WHERE email = ? LIMIT 1');
    checkStmt.bind([email]);
    if (checkStmt.step()) {
      checkStmt.free();
      return { data: { user: null, session: null }, error: { message: 'User already registered' } };
    }
    checkStmt.free();

    const hash = await hashPassword(password);
    const userId = uuid();
    const fullName = (options?.data?.full_name as string) || email.split('@')[0];
    const role = (options?.data?.role as string) || 'teacher';

    db.run('INSERT INTO auth_users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
      [userId, email, hash, new Date().toISOString()]);
    db.run(`INSERT INTO profiles (id, email, full_name, role, department, phone, avatar_url, fingerprint_enrolled, fingerprint_credential_id, webauthn_credentials, is_active, exempt_auto_logout, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, 0, NULL, '[]', 1, ?, ?, ?)`,
      [userId, email, fullName, role, role === 'admin' ? 1 : 0, new Date().toISOString(), new Date().toISOString()]);
    await persist();

    sessionToken = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    db.run('INSERT INTO auth_sessions (id, token, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), sessionToken, userId, email, expiresAt, new Date().toISOString()]);
    await persist();

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
      db.run('DELETE FROM auth_sessions WHERE token = ?', [sessionToken]);
      await persist();
    }
    sessionToken = null;
    notify('SIGNED_OUT', null);
    return { error: null };
  }

  async function resetPasswordForEmail(_email: string) {
    return { data: {}, error: null };
  }

  function onAuthStateChange(callback: (event: string, session: any) => void) {
    listeners.push(callback);
    getSession().then(({ data }) => callback('INITIAL_SESSION', data.session));
    return {
      subscription: {
        unsubscribe: () => {
          const idx = listeners.indexOf(callback);
          if (idx >= 0) listeners.splice(idx, 1);
        },
      },
    };
  }

  return { getSession, getUser, signInWithPassword, signUp, signOut, resetPasswordForEmail, onAuthStateChange };
}

// ---------- Crypto helpers (Web Crypto API) ----------

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:100000:${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  const salt = new Uint8Array(parts[2].match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const expectedHash = parts[3];
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256);
  const hashHex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex === expectedHash;
}

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Main client ----------

class SqliteClient {
  private db: Database;
  private persistFn: () => Promise<void>;
  auth: any;

  constructor(db: Database, persist: () => Promise<void>) {
    this.db = db;
    this.persistFn = persist;
  }

  async initAuth() {
    this.auth = await createSqliteAuth(this.db, this.persistFn);
  }

  from(table: string): QueryBuilder { return new QueryBuilder(this.db, table); }
  rpc(fnName: string): RpcBuilder { return new RpcBuilder(this.db, fnName); }
  channel(_name: string): FakeChannel { return new FakeChannel(); }
  removeChannel(ch: FakeChannel): void { ch.unsubscribe(); }
}

// ---------- Initialization ----------

let SQL: SqlJsStatic | null = null;

export async function createSqliteClient(): Promise<SqliteClient> {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    });
  }

  const savedData = await loadFromIDB();
  let db: Database;

  if (savedData) {
    db = new SQL.Database(savedData);
  } else {
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(SEED_SQL);
    await saveToIDB(db.export());
  }

  const persist = async () => {
    await saveToIDB(db.export());
  };

  const client = new SqliteClient(db, persist);
  await client.initAuth();
  return client;
}

export type { SqliteClient };
