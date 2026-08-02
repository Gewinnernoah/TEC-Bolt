// Local PostgreSQL API server for the TEC Hub app.
//
// This server runs on your machine, connects to your local PostgreSQL,
// and exposes a simple REST API that the browser app can talk to.
//
// Start it with:  node server/postgres-server.mjs  (or npm run dev starts it automatically)
//
// Configuration via environment variables or .env file:
//   PG_HOST      default: localhost
//   PG_PORT      default: 5432
//   PG_USER      default: postgres
//   PG_PASSWORD  default: postgres
//   PG_DATABASE  default: techub
//   API_PORT     default: 3456

import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- Load .env manually (no dependency on dotenv) ----------
function loadEnv() {
  const envPath = join(__dirname, '..', '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const PG_HOST = process.env.PG_HOST || 'localhost';
const PG_PORT = parseInt(process.env.PG_PORT || '5432', 10);
const PG_USER = process.env.PG_USER || 'postgres';
const PG_PASSWORD = process.env.PG_PASSWORD || 'postgres';
const PG_DATABASE = process.env.PG_DATABASE || 'techub';
const API_PORT = parseInt(process.env.API_PORT || '3456', 10);

const pool = new pg.Pool({
  host: PG_HOST,
  port: PG_PORT,
  user: PG_USER,
  password: PG_PASSWORD,
  database: PG_DATABASE,
  max: 10,
  idleTimeoutMillis: 30000,
});

// ---------- CORS ----------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(res, data, status = 200) {
  return res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' }).end(JSON.stringify(data));
}

// ---------- UUID + token helpers ----------
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function token() {
  const chars = 'abcdef0123456789';
  let t = '';
  for (let i = 0; i < 64; i++) t += chars[Math.floor(Math.random() * 16)];
  return t;
}

// ---------- Password hashing (PBKDF2 via Node crypto) ----------
function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  return `pbkdf2:100000:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  const salt = Buffer.from(parts[2], 'hex');
  const expected = Buffer.from(parts[3], 'hex');
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

// ---------- Auth middleware ----------
async function getUserFromReq(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const tok = auth.slice(7);
  const result = await pool.query(
    'SELECT s.user_id, s.email, s.expires_at FROM auth_sessions s WHERE s.token = $1 AND s.expires_at > now() LIMIT 1',
    [tok]
  );
  if (result.rows.length === 0) return null;
  return { id: result.rows[0].user_id, email: result.rows[0].email };
}

// ---------- Tables that have an updated_at column ----------
const HAS_UPDATED_AT = new Set([
  'profiles', 'devices', 'consumables', 'printers', 'print_requests',
  'tickets', 'faqs', 'events', 'repair_records', 'lending_requests',
  'lending_loans', 'filament_inventory', 'system_settings',
]);

// ---------- Tables that have a created_at column ----------
const HAS_CREATED_AT = new Set([
  'profiles', 'inventory_categories', 'buildings', 'rooms', 'cabinets', 'shelves',
  'devices', 'device_bundles', 'device_bundle_items', 'lending_periods', 'break_periods',
  'lending_requests', 'lending_request_items', 'lending_loans', 'lending_loan_items',
  'system_settings', 'activity_logs', 'consumables', 'filament_catalog', 'filament_inventory',
  'printers', 'print_requests', 'ticket_categories', 'tickets', 'ticket_comments',
  'wifi_measurements', 'faqs', 'events', 'event_tasks', 'damage_reports', 'repair_records',
  'inventory_audits', 'inventory_audit_items', 'device_notes', 'notifications',
]);

// ---------- Schema initialization ----------
async function initSchema() {
  const schemaPath = join(__dirname, 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf-8');
  await pool.query(sql);
  console.log('[DB] Schema initialized');

  // Check if any admin user exists; if not, create default admin
  const { rows } = await pool.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
  if (rows.length === 0) {
    const adminId = uuid();
    const adminEmail = 'admin@techub.local';
    const adminPass = hashPassword('admin123');
    await pool.query('INSERT INTO auth_users (id, email, password_hash) VALUES ($1, $2, $3)', [adminId, adminEmail, adminPass]);
    await pool.query(
      'INSERT INTO profiles (id, email, full_name, role, is_active, exempt_auto_logout) VALUES ($1, $2, $3, $4, true, true)',
      [adminId, adminEmail, 'Administrator', 'admin']
    );
    console.log('[DB] Default admin created: admin@techub.local / admin123');
  }
}

// ---------- Query Builder → SQL translation ----------
function buildSelect(table, params) {
  let sql = `SELECT * FROM "${table}"`;
  const values = [];
  const conditions = [];

  const filters = params.filters || {};
  for (const [key, val] of Object.entries(filters)) {
    let col = key;
    let op = '=';
    const opIdx = key.indexOf('__');
    if (opIdx > 0) {
      col = key.slice(0, opIdx);
      const opName = key.slice(opIdx + 2);
      const opMap = { neq: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=', like: 'LIKE', ilike: 'ILIKE' };
      if (opMap[opName]) op = opMap[opName];
      else if (opName === 'in') {
        const items = String(val).split(',').filter(Boolean);
        if (items.length === 0) { conditions.push('FALSE'); continue; }
        const placeholders = items.map((_, i) => `$${values.length + 1 + i}`).join(',');
        values.push(...items);
        conditions.push(`"${col}" IN (${placeholders})`);
        continue;
      } else if (opName === 'is') {
        if (val === 'null') { conditions.push(`"${col}" IS NULL`); continue; }
        values.push(val);
        conditions.push(`"${col}" IS NOT NULL AND "${col}" = $${values.length}`);
        continue;
      }
    }
    values.push(val);
    conditions.push(`"${col}" ${op} $${values.length}`);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  if (params.order) {
    sql += ` ORDER BY "${params.order.column}" ${params.order.ascending ? 'ASC' : 'DESC'}`;
  }

  if (params.limit) {
    sql += ` LIMIT ${parseInt(params.limit, 10)}`;
  }

  return { sql, values };
}

// ---------- Value encoding ----------
const JSON_COLS = new Set([
  'metadata', 'webauthn_credentials', 'photos', 'installed_technology',
  'available_connections', 'connections', 'speedtest_result', 'ping_result',
  'stage_plan', 'equipment_plan', 'rehearsal_schedule', 'intake_form_data',
  'details', 'tags', 'value',
]);

function encodeValue(col, val) {
  if (val === undefined || val === null) return null;
  if (JSON_COLS.has(col)) return JSON.stringify(val);
  if (typeof val === 'boolean') return val;
  return val;
}

function normalizeRow(row) {
  if (!row) return null;
  const out = {};
  for (const [key, val] of Object.entries(row)) {
    if (JSON_COLS.has(key) && typeof val === 'string') {
      try { out[key] = JSON.parse(val); } catch { out[key] = val; }
    } else {
      out[key] = val;
    }
  }
  return out;
}

// ---------- Route handlers ----------
async function handleRequest(req, res, body) {
  const url = new URL(req.url, `http://localhost:${API_PORT}`);
  const path = url.pathname;
  const method = req.method;

  // ---------- Health check ----------
  if (path === '/api/health' && method === 'GET') {
    return json(res, { status: 'ok', database: PG_DATABASE, host: PG_HOST, port: PG_PORT });
  }

  // ---------- Auth routes ----------
  if (path === '/api/auth/signup' && method === 'POST') {
    const { email, password, full_name, role } = body;
    if (!email || !password) return json(res, { error: 'Email and password required' }, 400);

    const existing = await pool.query('SELECT id FROM auth_users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return json(res, { error: 'User already registered' }, 400);

    const userId = uuid();
    const hash = hashPassword(password);
    const name = full_name || email.split('@')[0];
    const userRole = role || 'teacher';

    await pool.query('INSERT INTO auth_users (id, email, password_hash) VALUES ($1, $2, $3)', [userId, email, hash]);
    await pool.query(
      'INSERT INTO profiles (id, email, full_name, role, is_active, exempt_auto_logout) VALUES ($1, $2, $3, $4, true, $5)',
      [userId, email, name, userRole, userRole === 'admin']
    );

    const tok = token();
    const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await pool.query('INSERT INTO auth_sessions (id, token, user_id, email, expires_at) VALUES ($1, $2, $3, $4, $5)', [uuid(), tok, userId, email, expires]);

    return json(res, {
      user: { id: userId, email },
      session: { access_token: tok, user: { id: userId, email }, expires_at: Math.floor(expires.getTime() / 1000) },
    });
  }

  if (path === '/api/auth/signin' && method === 'POST') {
    const { email, password } = body;
    if (!email || !password) return json(res, { error: 'Email and password required' }, 400);

    const result = await pool.query('SELECT * FROM auth_users WHERE email = $1 LIMIT 1', [email]);
    if (result.rows.length === 0) return json(res, { error: 'Invalid login credentials' }, 400);

    const user = result.rows[0];
    if (!verifyPassword(password, user.password_hash)) return json(res, { error: 'Invalid login credentials' }, 400);

    const tok = token();
    const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await pool.query('INSERT INTO auth_sessions (id, token, user_id, email, expires_at) VALUES ($1, $2, $3, $4, $5)', [uuid(), tok, user.id, email, expires]);

    return json(res, {
      user: { id: user.id, email },
      session: { access_token: tok, user: { id: user.id, email }, expires_at: Math.floor(expires.getTime() / 1000) },
    });
  }

  if (path === '/api/auth/signout' && method === 'POST') {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const tok = auth.slice(7);
      await pool.query('DELETE FROM auth_sessions WHERE token = $1', [tok]);
    }
    return json(res, {});
  }

  if (path === '/api/auth/session' && method === 'GET') {
    const user = await getUserFromReq(req);
    if (!user) return json(res, { session: null });
    return json(res, {
      session: {
        access_token: req.headers.authorization.slice(7),
        user,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
      },
    });
  }

  // ---------- RPC ----------
  if (path === '/api/rpc' && method === 'POST') {
    const { fn } = body;
    if (fn === 'generate_ticket_number') {
      const { rows } = await pool.query('SELECT generate_ticket_number() AS result');
      return json(res, { result: rows[0].result });
    }
    return json(res, { error: 'Unknown RPC function' }, 400);
  }

  // ---------- Generic CRUD: /api/table or /api/table/:id ----------
  const crudMatch = path.match(/^\/api\/([\w]+)(\/([\w-]+))?$/);
  if (crudMatch) {
    const table = crudMatch[1];
    const id = crudMatch[3];

    // GET = select
    if (method === 'GET') {
      let params = {};
      if (id) {
        params = { filters: { id } };
      } else {
        const filtersParam = url.searchParams.get('filters');
        const orderParam = url.searchParams.get('order');
        const limitParam = url.searchParams.get('limit');
        if (filtersParam) {
          try { params.filters = JSON.parse(filtersParam); } catch { /* ignore */ }
        }
        if (orderParam) {
          try { params.order = JSON.parse(orderParam); } catch { /* ignore */ }
        }
        if (limitParam) params.limit = parseInt(limitParam, 10);
      }
      const { sql, values } = buildSelect(table, params);
      const result = await pool.query(sql, values);
      const rows = result.rows.map(normalizeRow);
      if (id) return json(res, { data: rows[0] || null });
      return json(res, { data: rows });
    }

    // Auth required for mutations
    const user = await getUserFromReq(req);
    if (!user) return json(res, { error: 'Unauthorized' }, 401);

    // POST = insert (or update if /api/table/:id)
    if (method === 'POST') {
      if (id) {
        // POST to /api/table/:id = update
        const data = { ...body };
        if (HAS_UPDATED_AT.has(table)) data.updated_at = new Date().toISOString();
        delete data.id;
        const cols = Object.keys(data);
        if (cols.length === 0) return json(res, { data: null, error: { message: 'No fields to update' } });
        const setClause = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
        const vals = cols.map((c) => encodeValue(c, data[c]));
        vals.push(id);
        await pool.query(`UPDATE "${table}" SET ${setClause} WHERE "id" = $${vals.length}`, vals);
        const result = await pool.query(`SELECT * FROM "${table}" WHERE "id" = $1`, [id]);
        return json(res, { data: normalizeRow(result.rows[0]) || null });
      }
      const data = { ...body };
      if (!data.id) data.id = uuid();
      if (HAS_CREATED_AT.has(table) && !data.created_at) data.created_at = new Date().toISOString();
      if (HAS_UPDATED_AT.has(table) && !data.updated_at) data.updated_at = new Date().toISOString();

      const cols = Object.keys(data);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const values = cols.map((c) => encodeValue(c, data[c]));
      await pool.query(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`, values);
      return json(res, { data: normalizeRow(data) });
    }

    // PUT = update (by id)
    if (method === 'PUT' && id) {
      const data = { ...body };
      if (HAS_UPDATED_AT.has(table)) data.updated_at = new Date().toISOString();
      delete data.id;
      const cols = Object.keys(data);
      if (cols.length === 0) return json(res, { data: null, error: { message: 'No fields to update' } });
      const setClause = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
      const values = cols.map((c) => encodeValue(c, data[c]));
      values.push(id);
      await pool.query(`UPDATE "${table}" SET ${setClause} WHERE "id" = $${values.length}`, values);
      const result = await pool.query(`SELECT * FROM "${table}" WHERE "id" = $1`, [id]);
      return json(res, { data: normalizeRow(result.rows[0]) || null });
    }

    // DELETE = delete (by id)
    if (method === 'DELETE' && id) {
      await pool.query(`DELETE FROM "${table}" WHERE "id" = $1`, [id]);
      return json(res, { data: null });
    }
  }

  return json(res, { error: 'Not found' }, 404);
}

// ---------- HTTP server ----------
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.writeHead(204, CORS).end();
  }

  let body = {};
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    if (raw) {
      try { body = JSON.parse(raw); } catch { return json(res, { error: 'Invalid JSON' }, 400); }
    }
  }

  try {
    await handleRequest(req, res, body);
  } catch (err) {
    console.error('[Server] Error:', err.message);
    json(res, { error: err.message }, 500);
  }
});

async function start() {
  try {
    await initSchema();
  } catch (err) {
    console.error('[DB] Failed to initialize schema:', err.message);
    console.error('       Check your PostgreSQL connection settings in .env');
    process.exit(1);
  }

  server.listen(API_PORT, () => {
    console.log('');
    console.log('  ================================================');
    console.log('  TEC Hub - PostgreSQL API Server');
    console.log('  ================================================');
    console.log(`  PostgreSQL:  ${PG_HOST}:${PG_PORT}/${PG_DATABASE}`);
    console.log(`  API:         http://localhost:${API_PORT}`);
    console.log(`  Health:      http://localhost:${API_PORT}/api/health`);
    console.log('  ================================================');
    console.log('  Default admin: admin@techub.local / admin123');
    console.log('  ================================================');
    console.log('');
  });
}

start();
