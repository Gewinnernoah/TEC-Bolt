// MongoDB Atlas Data API adapter.
// Mimics the Supabase PostgREST query-builder API so app code works unchanged.

const DATA_API_BASE = import.meta.env.VITE_MONGODB_DATA_API_URL as string;
const DATA_API_KEY = import.meta.env.VITE_MONGODB_DATA_API_KEY as string;
const DATA_SOURCE = import.meta.env.VITE_MONGODB_DATA_SOURCE as string;
const DATABASE = import.meta.env.VITE_MONGODB_DATABASE as string;
const APP_NAME = import.meta.env.VITE_MONGODB_APP_NAME as string | undefined;

const CLUSTER = DATA_SOURCE || 'Cluster0';
const DB_NAME = DATABASE || 'techub';

// ---------- helpers ----------

function assertConfig() {
  if (!DATA_API_BASE || !DATA_API_KEY) {
    throw new Error('MongoDB Data API not configured. Set VITE_MONGODB_DATA_API_URL and VITE_MONGODB_DATA_API_KEY in .env');
  }
}

async function apiCall(action: string, body: Record<string, unknown>) {
  assertConfig();
  const url = `${DATA_API_BASE}/action/${action}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Request-Headers': '*',
      'api-key': DATA_API_KEY,
    },
    body: JSON.stringify({ dataSource: CLUSTER, database: DB_NAME, ...body }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`MongoDB API ${action} failed (${res.status}): ${text}`);
  }
  return res.json();
}

function toObjectId(id: string): Record<string, unknown> {
  return { $oid: id };
}

function uuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Convert a PostgREST-style filter value to a Mongo filter value
function convertValue(v: unknown): unknown {
  if (v === null) return null;
  if (Array.isArray(v)) return v.map(convertValue);
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

// ---------- Query Builder ----------

type Row = Record<string, unknown>;
type PostgrestError = { message: string };

class QueryBuilder<T = Row> {
  private _collection: string;
  private _select: string | null = null;
  private _filter: Record<string, unknown> = {};
  private _order: { column: string; ascending: boolean } | null = null;
  private _limit: number | null = null;
  private _insertData: Row | Row[] | null = null;
  private _updateData: Row | null = null;
  private _isDelete = false;
  private _isUpsert = false;
  private _expectSingle = false;
  private _expectMaybeSingle = false;

  constructor(collection: string) { this._collection = collection; }

  select(columns: string = '*'): this {
    this._select = columns;
    return this;
  }

  // Parse PostgREST select string to extract referenced related collections
  private _parseSelect(): { relationships: Map<string, { fkCol: string; target: string; nested: boolean }> } {
    const relationships = new Map<string, { fkCol: string; target: string; nested: boolean }>();
    if (!this._select || this._select === '*') return { relationships };

    const parts = this._select.split(/,(?![^()]*\))/);
    for (const part of parts) {
      const trimmed = part.trim();
      // Match: alias:target_collection(...)
      const match = trimmed.match(/^(\w+):(\w+)(?:\([^)]+\))?$/);
      if (match) {
        const alias = match[1];
        const target = match[2];
        const fkCol = `${alias}_id`;
        relationships.set(alias, { fkCol, target, nested: false });
      }
      // Match nested: items:collection(*, sub:other(*))
      const nestedMatch = trimmed.match(/^(\w+):(\w+)\((.*)\)$/);
      if (nestedMatch) {
        const alias = nestedMatch[1];
        const target = nestedMatch[2];
        const inner = nestedMatch[3];
        const hasNested = inner.includes(':');
        const fkCol = `${alias}_id`;
        relationships.set(alias, { fkCol, target, nested: hasNested || inner.includes('*') });
      }
    }
    return { relationships };
  }

  // ---- filter methods ----

  eq(column: string, value: unknown): this {
    this._filter[column] = convertValue(value);
    return this;
  }

  neq(column: string, value: unknown): this {
    this._filter[column] = { $ne: convertValue(value) };
    return this;
  }

  gt(column: string, value: unknown): this {
    this._filter[column] = { $gt: convertValue(value) };
    return this;
  }

  lt(column: string, value: unknown): this {
    this._filter[column] = { $lt: convertValue(value) };
    return this;
  }

  gte(column: string, value: unknown): this {
    this._filter[column] = { $gte: convertValue(value) };
    return this;
  }

  lte(column: string, value: unknown): this {
    this._filter[column] = { $lte: convertValue(value) };
    return this;
  }

  like(column: string, pattern: string): this {
    // PostgREST LIKE: % = .*, _ = .
    const regex = pattern.replace(/%/g, '.*').replace(/_/g, '.').replace(/[.+^${}()|[\]\\]/g, '\\$&');
    this._filter[column] = { $regex: regex };
    return this;
  }

  ilike(column: string, pattern: string): this {
    const regex = pattern.replace(/%/g, '.*').replace(/_/g, '.').replace(/[.+^${}()|[\]\\]/g, '\\$&');
    this._filter[column] = { $regex: regex, $options: 'i' };
    return this;
  }

  in(column: string, values: unknown[]): this {
    this._filter[column] = { $in: values.map(convertValue) };
    return this;
  }

  is(column: string, value: unknown): this {
    if (value === null) this._filter[column] = null;
    else this._filter[column] = convertValue(value);
    return this;
  }

  not(column: string, _op: string, value: unknown): this {
    this._filter[column] = { $ne: convertValue(value) };
    return this;
  }

  or(filter: string): this {
    // PostgREST or format: "col1.eq.val,col2.eq.val2"
    const conditions: Record<string, unknown>[] = [];
    for (const part of filter.split(',')) {
      const [col, op, val] = part.split('.');
      if (op === 'eq') conditions.push({ [col]: convertValue(val) });
      else if (op === 'neq') conditions.push({ [col]: { $ne: convertValue(val) } });
      else conditions.push({ [col]: convertValue(val) });
    }
    this._filter = { $or: conditions };
    return this;
  }

  contains(column: string, value: unknown): this {
    this._filter[column] = { $all: Array.isArray(value) ? value : [value] };
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

  // ---- mutation methods ----

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

  single(): Promise<{ data: T | null; error: PostgrestError | null }> {
    this._expectSingle = true;
    return this._execute() as Promise<{ data: T | null; error: PostgrestError | null }>;
  }

  maybeSingle(): Promise<{ data: T | null; error: PostgrestError | null }> {
    this._expectMaybeSingle = true;
    return this._execute() as Promise<{ data: T | null; error: PostgrestError | null }>;
  }

  // ---- execution ----

  private async _execute(): Promise<{ data: unknown; error: PostgrestError | null }> {
    try {
      if (this._insertData) return await this._execInsert();
      if (this._updateData) return await this._execUpdate();
      if (this._isDelete) return await this._execDelete();
      return await this._execSelect();
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? 'Database error' } };
    }
  }

  private async _execSelect(): Promise<{ data: unknown; error: PostgrestError | null }> {
    const { relationships } = this._parseSelect();

    const sort: Record<string, 1 | -1> = {};
    if (this._order) sort[this._order.column] = this._order.ascending ? 1 : -1;

    const body: Record<string, unknown> = {
      collection: this._collection,
      filter: this._filter,
    };
    if (Object.keys(sort).length > 0) body.sort = sort;
    if (this._limit !== null) body.limit = this._limit;

    const result = await apiCall('find', body);
    let docs = (result.documents || []) as Row[];

    // Hydrate relationships
    for (const alias of relationships.keys()) {
      const rel = relationships.get(alias)!;
      const fkValues = docs.map((d) => d[rel.fkCol]).filter(Boolean);
      if (fkValues.length === 0) {
        docs.forEach((d) => (d[alias] = null));
        continue;
      }
      const subResult = await apiCall('find', {
        collection: rel.target,
        filter: { id: { $in: [...new Set(fkValues)] } },
      });
      const subDocs = (subResult.documents || []) as Row[];
      const byId = new Map(subDocs.map((d) => [d.id, d]));
      for (const doc of docs) {
        const fk = doc[rel.fkCol];
        doc[alias] = fk ? (byId.get(fk) ?? null) : null;
      }
    }

    // For nested relationships (e.g. items:lending_loan_items(*, device:devices(*)))
    // we need a second pass: fetch child documents that reference the current doc
    const nestedRels = [...relationships.entries()].filter(([, r]) => r.nested);
    for (const [alias, rel] of nestedRels) {
      // Convention: child collection has <singular>_id pointing back
      const singular = this._collection.replace(/s$/, '');
      const childFkCol = `${singular}_id`;
      const parentIds = docs.map((d) => d.id).filter(Boolean);
      if (parentIds.length === 0) continue;
      const subResult = await apiCall('find', {
        collection: rel.target,
        filter: { [childFkCol]: { $in: parentIds } },
      });
      const subDocs = (subResult.documents || []) as Row[];
      // Group by parent FK
      const byParent = new Map<string, Row[]>();
      for (const sd of subDocs) {
        const pid = sd[childFkCol] as string;
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid)!.push(sd);
      }
      for (const doc of docs) {
        doc[alias] = byParent.get(doc.id as string) ?? [];
      }
    }

    // Normalize: add id if missing (Mongo uses _id)
    docs = docs.map(normalizeDoc);

    if (this._expectSingle || this._expectMaybeSingle) {
      if (docs.length === 0) {
        if (this._expectMaybeSingle) return { data: null, error: null };
        return { data: null, error: { message: 'No rows found' } };
      }
      return { data: docs[0], error: null };
    }
    return { data: docs, error: null };
  }

  private async _execInsert(): Promise<{ data: unknown; error: PostgrestError | null }> {
    const dataArr = Array.isArray(this._insertData) ? this._insertData : [this._insertData!];
    const docs = dataArr.map((row) => {
      const doc: Row = { ...row };
      if (!doc.id) doc.id = uuid();
      if (!doc.created_at) doc.created_at = new Date().toISOString();
      if (!doc.updated_at) doc.updated_at = new Date().toISOString();
      return doc;
    });

    if (this._isUpsert) {
      // upsert by key — find the first non-id field as conflict key
      const results: Row[] = [];
      for (const doc of docs) {
        const filter: Record<string, unknown> = {};
        if (doc.id) filter.id = doc.id;
        else if (doc.key) filter.key = doc.key;
        else if (doc.email) filter.email = doc.email;
        else if (doc.inventory_number) filter.inventory_number = doc.inventory_number;

        const existing = await apiCall('findOne', { collection: this._collection, filter });
        if (existing.document) {
          const updateResult = await apiCall('updateOne', {
            collection: this._collection,
            filter,
            update: { $set: { ...doc, updated_at: new Date().toISOString() } },
          });
          const refetched = await apiCall('findOne', { collection: this._collection, filter });
          results.push(normalizeDoc(refetched.document));
        } else {
          await apiCall('insertOne', { collection: this._collection, document: doc });
          results.push(normalizeDoc(doc));
        }
      }
      if (this._expectSingle || this._expectMaybeSingle) return { data: results[0] ?? null, error: null };
      return { data: results, error: null };
    }

    if (docs.length === 1) {
      const result = await apiCall('insertOne', { collection: this._collection, document: docs[0] });
      const out = normalizeDoc({ ...docs[0], _id: result.insertedId });
      if (this._expectSingle || this._expectMaybeSingle) return { data: out, error: null };
      return { data: [out], error: null };
    }

    const result = await apiCall('insertMany', { collection: this._collection, documents: docs });
    const out = docs.map((d) => normalizeDoc(d));
    return { data: out, error: null };
  }

  private async _execUpdate(): Promise<{ data: unknown; error: PostgrestError | null }> {
    const updateData = { ...this._updateData!, updated_at: new Date().toISOString() };
    const result = await apiCall('updateMany', {
      collection: this._collection,
      filter: this._filter,
      update: { $set: updateData },
    });

    // Fetch updated docs to return them (Supabase returns updated rows)
    const refetched = await apiCall('find', { collection: this._collection, filter: this._filter });
    let docs = (refetched.documents || []).map(normalizeDoc);

    if (this._expectSingle || this._expectMaybeSingle) return { data: docs[0] ?? null, error: null };
    return { data: docs, error: null };
  }

  private async _execDelete(): Promise<{ data: unknown; error: PostgrestError | null }> {
    // Fetch docs before deleting so we can return them (Supabase returns deleted rows)
    const before = await apiCall('find', { collection: this._collection, filter: this._filter });
    const docs = (before.documents || []).map(normalizeDoc);

    await apiCall('deleteMany', { collection: this._collection, filter: this._filter });

    if (this._expectSingle || this._expectMaybeSingle) return { data: docs[0] ?? null, error: null };
    return { data: docs, error: null };
  }

  then(onFulfilled: any, onRejected?: any) {
    return this._execute().then(onFulfilled, onRejected);
  }
}

// ---------- RPC ----------

class RpcBuilder {
  private _fnName: string;

  constructor(fnName: string) { this._fnName = fnName; }

  single(): Promise<{ data: unknown; error: PostgrestError | null }> {
    return this._execute();
  }

  private async _execute(): Promise<{ data: unknown; error: PostgrestError | null }> {
    try {
      if (this._fnName === 'generate_ticket_number') {
        const result = await apiCall('find', {
          collection: 'tickets',
          filter: {},
          sort: { ticket_number: -1 },
          limit: 1,
        });
        const docs = result.documents || [];
        let nextNum = 1;
        if (docs.length > 0 && docs[0].ticket_number) {
          const num = parseInt(String(docs[0].ticket_number).replace(/\D/g, ''), 10);
          if (!isNaN(num)) nextNum = num + 1;
        }
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

// ---------- Realtime stub ----------

class FakeChannel {
  callback: (() => void) | null = null;
  on(_event: string, _filter: any, cb: () => void): this { this.callback = cb; return this; }
  subscribe(): this {
    // Poll every 10s as a simple realtime substitute
    if (this.callback) {
      const id = setInterval(this.callback, 10_000);
      (this as any)._intervalId = id;
    }
    return this;
  }
  unsubscribe(): void {
    if ((this as any)._intervalId) clearInterval((this as any)._intervalId);
  }
}

// ---------- Auth ----------

async function createMongoAuth() {
  let sessionToken: string | null = null;
  let cachedUser: { id: string; email: string } | null = null;
  const listeners: ((event: string, session: any) => void)[] = [];

  function notify(event: string, session: any) {
    for (const l of listeners) l(event, session);
  }

  async function getSession() {
    if (!sessionToken) return { data: { session: null }, error: null };
    const result = await apiCall('findOne', {
      collection: 'auth_sessions',
      filter: { token: sessionToken, expires_at: { $gt: new Date().toISOString() } },
    });
    if (!result.document) {
      sessionToken = null;
      return { data: { session: null }, error: null };
    }
    const row = result.document;
    return {
      data: {
        session: {
          access_token: sessionToken,
          user: { id: row.user_id, email: row.email },
          expires_at: new Date(row.expires_at as string).getTime() / 1000,
        },
      },
      error: null,
    };
  }

  async function getUser() {
    const { data } = await getSession();
    if (!data.session) return { data: { user: null }, error: null };
    return { data: { user: data.session.user }, error: null };
  }

  async function signInWithPassword({ email, password }: { email: string; password: string }) {
    const result = await apiCall('findOne', {
      collection: 'auth_users',
      filter: { email },
    });
    if (!result.document) {
      return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
    }
    const row = result.document;
    const valid = await verifyPassword(password, row.password_hash as string);
    if (!valid) {
      return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
    }

    sessionToken = generateToken();
    cachedUser = { id: row.id as string, email };
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await apiCall('insertOne', {
      collection: 'auth_sessions',
      document: { id: uuid(), token: sessionToken, user_id: row.id, email, expires_at: expiresAt, created_at: new Date().toISOString() },
    });

    const session = {
      access_token: sessionToken,
      user: { id: row.id, email },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    };
    notify('SIGNED_IN', session);
    return { data: { user: session.user, session }, error: null };
  }

  async function signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
    const existing = await apiCall('findOne', { collection: 'auth_users', filter: { email } });
    if (existing.document) {
      return { data: { user: null, session: null }, error: { message: 'User already registered' } };
    }

    const hash = await hashPassword(password);
    const fullName = (options?.data?.full_name as string) || email.split('@')[0];
    const role = (options?.data?.role as string) || 'teacher';
    const userId = uuid();

    await apiCall('insertOne', {
      collection: 'auth_users',
      document: { id: userId, email, password_hash: hash, created_at: new Date().toISOString() },
    });

    // Create profile
    await apiCall('insertOne', {
      collection: 'profiles',
      document: {
        id: userId,
        email,
        full_name: fullName,
        role,
        department: null,
        phone: null,
        avatar_url: null,
        fingerprint_enrolled: false,
        fingerprint_credential_id: null,
        webauthn_credentials: [],
        is_active: true,
        exempt_auto_logout: role === 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    sessionToken = generateToken();
    cachedUser = { id: userId, email };
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await apiCall('insertOne', {
      collection: 'auth_sessions',
      document: { id: uuid(), token: sessionToken, user_id: userId, email, expires_at: expiresAt, created_at: new Date().toISOString() },
    });

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
      try {
        await apiCall('deleteMany', { collection: 'auth_sessions', filter: { token: sessionToken } });
      } catch { /* ignore */ }
    }
    sessionToken = null;
    cachedUser = null;
    notify('SIGNED_OUT', null);
    return { error: null };
  }

  async function resetPasswordForEmail(email: string) {
    // Check if user exists but don't reveal info
    const result = await apiCall('findOne', { collection: 'auth_users', filter: { email } });
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

// ---------- normalize ----------

function normalizeDoc(doc: Row | null): Row {
  if (!doc) return doc as Row;
  const out: Row = {};
  for (const key of Object.keys(doc)) {
    out[key] = doc[key];
  }
  // Keep _id for reference but always expose id
  if (!out.id && out._id) {
    out.id = String(out._id);
  }
  return out;
}

// ---------- Crypto helpers ----------

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

class MongoClient {
  auth: any;
  channel(_name: string): FakeChannel { return new FakeChannel(); }
  removeChannel(ch: FakeChannel): void { ch.unsubscribe(); }

  from(collection: string): QueryBuilder { return new QueryBuilder(collection); }
  rpc(fnName: string): RpcBuilder { return new RpcBuilder(fnName); }
}

export async function createMongoClient(): Promise<MongoClient> {
  const client = new MongoClient();
  client.auth = await createMongoAuth();
  return client;
}

export type { MongoClient };
