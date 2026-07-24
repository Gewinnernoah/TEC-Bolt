#!/usr/bin/env node
//
// create-test-accounts.mjs
// Creates 3 test accounts (admin, staff, teacher) for either Supabase or SQLite.
// The passwords are printed to the console.
//
// Usage:
//   node scripts/create-test-accounts.mjs              # auto-detect from .env
//   node scripts/create-test-accounts.mjs --supabase   # force Supabase
//   node scripts/create-test-accounts.mjs --sqlite     # force SQLite (browser-only, prints credentials only)
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
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^VITE_(\w+)=(.*)$/);
  if (match) env[`VITE_${match[1]}`] = match[2].trim();
}

// ---------- Determine mode ----------
const args = process.argv.slice(2);
let mode = env.VITE_DB_MODE || 'supabase';
if (args.includes('--supabase')) mode = 'supabase';
if (args.includes('--sqlite')) mode = 'sqlite';

// ---------- Test accounts ----------
const accounts = [
  { role: 'admin',   email: 'admin@test.local',   fullName: 'Test Admin',   password: 'Admin123!' },
  { role: 'staff',   email: 'staff@test.local',   fullName: 'Test Staff',   password: 'Staff123!' },
  { role: 'teacher', email: 'teacher@test.local', fullName: 'Test Teacher', password: 'Teacher123!' },
];

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

  if (mode === 'sqlite') {
    console.log('\x1b[33m[HINWEIS] SQLite laeuft im Browser. Accounts koennen nicht vom Terminal erstellt werden.\x1b[0m');
    console.log('\x1b[33mDie App erstellt die Datenbank beim ersten Start automatisch.\x1b[0m');
    console.log('\x1b[33mDu kannst dich ueber die Anmeldeseite registrieren oder folgende Zugangsdaten\nnach der Registrierung verwenden:\x1b[0m\n');
  }

  for (const acc of accounts) {
    if (mode === 'sqlite') {
      const role = acc.role.padEnd(10);
      const email = acc.email.padEnd(21);
      console.log(`  \x1b[32m[EMPFOHLEN]\x1b[0m ${role} ${email} \x1b[33m${acc.password}\x1b[0m`);
      continue;
    }

    try {
      const result = await supabaseSignUp(acc.email, acc.password, acc.fullName, acc.role);
      if (result.alreadyExists) {
        console.log(`  \x1b[33m[EXISTIERT]\x1b[0m ${acc.role}: ${acc.email}`);
      } else {
        console.log(`  \x1b[32m[ERSTELLT]\x1b[0m  ${acc.role}: ${acc.email}`);
      }
    } catch (e) {
      console.error(`  \x1b[31m[FEHLER]\x1b[0m  ${acc.role}: ${e.message}`);
    }
  }

  // Print credentials table
  console.log('\n\x1b[36m========================================\x1b[0m');
  console.log('\x1b[36m  Zugangsdaten (Test-Accounts)\x1b[0m');
  console.log('\x1b[36m========================================\x1b[0m\n');
  console.log('  \x1b[1mRolle      Email                 Passwort\x1b[0m');
  console.log('  \x1b[2m---------- --------------------- ----------\x1b[0m');
  for (const acc of accounts) {
    const role = acc.role.padEnd(10);
    const email = acc.email.padEnd(21);
    console.log(`  ${role} ${email} \x1b[33m${acc.password}\x1b[0m`);
  }
  console.log('\n  \x1b[33mWICHTIG: Diese Passwoerter nur fuer Tests verwenden!\x1b[0m');
  console.log('  \x1b[33mIn Produktion durch sichere Passwoerter ersetzen.\x1b[0m');

  if (mode === 'sqlite') {
    console.log('\n  \x1b[36mSQLite: Registriere dich in der App mit den oben genannten Emails.\x1b[0m');
    console.log('  \x1b[36mDie Datenbank wird lokal im Browser gespeichert.\x1b[0m');
  }
  console.log('');
}

main().catch((e) => {
  console.error(`\x1b[31m\nAbgebrochen: ${e.message}\x1b[0m\n`);
  process.exit(1);
});
