#!/usr/bin/env node
//
// create-test-accounts.mjs
// Creates 3 test accounts (admin, staff, teacher) for either Supabase or MongoDB.
// The passwords are printed to the console.
//
// Usage:
//   node scripts/create-test-accounts.mjs              # auto-detect from .env
//   node scripts/create-test-accounts.mjs --supabase   # force Supabase
//   node scripts/create-test-accounts.mjs --mongodb    # force MongoDB
//
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// ---------- Load .env ----------
const envPath = resolve(projectRoot, '.env');
if (!existsSync(envPath)) {
  console.error('\x1b[31m[ERROR] Keine .env-Datei gefunden. Bitte zuerst autoinstaller ausfuehren.\x1b[0m');
  process.exit(1);
}

const envContent = readFileSync(envPath, 'utf8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^VITE_(\w+)=(.*)$/);
  if (match) env[`VITE_${match[1]}`] = match[2].trim();
}

// ---------- Determine mode ----------
const args = process.argv.slice(2);
let mode = env.VITE_DB_MODE || 'supabase';
if (args.includes('--supabase')) mode = 'supabase';
if (args.includes('--mongodb')) mode = 'mongodb';

// ---------- Test accounts ----------
const accounts = [
  { role: 'admin',  email: 'admin@test.local',  fullName: 'Test Admin',  password: 'Admin123!' },
  { role: 'staff',  email: 'staff@test.local',  fullName: 'Test Staff',  password: 'Staff123!' },
  { role: 'teacher',email: 'teacher@test.local',fullName: 'Test Teacher',password: 'Teacher123!' },
];

// ---------- PBKDF2 hashing (for MongoDB mode) ----------
const crypto = await import('crypto');

function hashPasswordPbkdf2(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const saltHex = salt.toString('hex');
  const hashHex = hash.toString('hex');
  return `pbkdf2:100000:${saltHex}:${hashHex}`;
}

function uuid() {
  return crypto.randomUUID();
}

// ---------- MongoDB Data API ----------
async function mongoApiCall(action, body) {
  const baseUrl = env.VITE_MONGODB_DATA_API_URL;
  const apiKey = env.VITE_MONGODB_DATA_API_KEY;
  const dataSource = env.VITE_MONGODB_DATA_SOURCE || 'Cluster0';
  const database = env.VITE_MONGODB_DATABASE || 'techub';

  if (!baseUrl || !apiKey) {
    throw new Error('MongoDB Data API nicht konfiguriert. VITE_MONGODB_DATA_API_URL und VITE_MONGODB_DATA_API_KEY in .env setzen.');
  }

  const res = await fetch(`${baseUrl}/action/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify({ dataSource, database, ...body }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`MongoDB API ${action} fehlgeschlagen (${res.status}): ${text}`);
  }
  return res.json();
}

// ---------- Supabase Auth ----------
async function supabaseSignUp(email, password, fullName, role) {
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase nicht konfiguriert. VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY in .env setzen.');
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ email, password, options: { data: { full_name: fullName, role } } }),
  });
  const data = await res.json();
  if (!res.ok) {
    // User might already exist
    if (data?.message?.includes('already') || data?.code === 'user_already_exists') {
      return { alreadyExists: true };
    }
    throw new Error(`Supabase signup fehlgeschlagen: ${data?.message || res.statusText}`);
  }
  return { alreadyExists: false, user: data.user };
}

// ---------- Main ----------
async function main() {
  console.log('\n\x1b[36m========================================\x1b[0m');
  console.log('\x1b[36m  Test-Accounts erstellen\x1b[0m');
  console.log(`\x1b[36m  Datenbank-Modus: ${mode}\x1b[0m`);
  console.log('\x1b[36m========================================\x1b[0m\n');

  const created = [];

  for (const acc of accounts) {
    try {
      if (mode === 'mongodb') {
        // Check if already exists
        const existing = await mongoApiCall('findOne', {
          collection: 'auth_users',
          filter: { email: acc.email },
        });
        if (existing.document) {
          console.log(`  \x1b[33m[EXISTIERT]\x1b[0m ${acc.role}: ${acc.email}`);
          created.push({ ...acc, status: 'exists' });
          continue;
        }

        const userId = uuid();
        const hash = hashPasswordPbkdf2(acc.password);

        await mongoApiCall('insertOne', {
          collection: 'auth_users',
          document: { id: userId, email: acc.email, password_hash: hash, created_at: new Date().toISOString() },
        });

        await mongoApiCall('insertOne', {
          collection: 'profiles',
          document: {
            id: userId,
            email: acc.email,
            full_name: acc.fullName,
            role: acc.role,
            department: null,
            phone: null,
            avatar_url: null,
            fingerprint_enrolled: false,
            fingerprint_credential_id: null,
            webauthn_credentials: [],
            is_active: true,
            exempt_auto_logout: acc.role === 'admin',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        });

        console.log(`  \x1b[32m[ERSTELLT]\x1b[0m  ${acc.role}: ${acc.email}`);
        created.push({ ...acc, status: 'created' });
      } else {
        // Supabase mode
        const result = await supabaseSignUp(acc.email, acc.password, acc.fullName, acc.role);
        if (result.alreadyExists) {
          console.log(`  \x1b[33m[EXISTIERT]\x1b[0m ${acc.role}: ${acc.email}`);
          created.push({ ...acc, status: 'exists' });
        } else {
          console.log(`  \x1b[32m[ERSTELLT]\x1b[0m  ${acc.role}: ${acc.email}`);
          created.push({ ...acc, status: 'created' });
        }
      }
    } catch (e) {
      console.error(`  \x1b[31m[FEHLER]\x1b[0m  ${acc.role}: ${e.message}`);
      created.push({ ...acc, status: 'error', error: e.message });
    }
  }

  // Print credentials
  console.log('\n\x1b[36m========================================\x1b[0m');
  console.log('\x1b[36m  Zugangsdaten (Test-Accounts)\x1b[0m');
  console.log('\x1b[36m========================================\x1b[0m\n');
  console.log('  \x1b[1mRolle      Email                 Passwort\x1b[0m');
  console.log('  \x1b[2m---------- --------------------- ----------\x1b[0m');
  for (const acc of created) {
    const role = acc.role.padEnd(10);
    const email = acc.email.padEnd(21);
    const pass = acc.password;
    if (acc.status === 'error') {
      console.log(`  ${role} ${email} \x1b[31m${acc.error}\x1b[0m`);
    } else {
      console.log(`  ${role} ${email} \x1b[33m${pass}\x1b[0m`);
    }
  }
  console.log('\n  \x1b[33mWICHTIG: Diese Passwoerter nur fuer Tests verwenden!\x1b[0m');
  console.log('  \x1b[33mIn Produktion durch sichere Passwoerter ersetzen.\x1b[0m\n');
}

main().catch((e) => {
  console.error(`\x1b[31m\nAbgebrochen: ${e.message}\x1b[0m\n`);
  process.exit(1);
});
