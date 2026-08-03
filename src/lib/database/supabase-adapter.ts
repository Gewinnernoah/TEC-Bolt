// Supabase / PostgreSQL-Adapter
// Verwendet den offiziellen Supabase-JavaScript-Client, der mit der
// bereitgestellten PostgreSQL-Instanz kommuniziert.
// Alle Verbindungsfehler werden mit deutschen Diagnosemeldungen protokolliert.

import { createClient } from '@supabase/supabase-js';
import { logInit, dbLog, logOk, describeError } from './logger';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  dbLog('error', 'init', 'Supabase-Umgebungsvariablen fehlen', {
    urlVorhanden: !!supabaseUrl,
    schluesselVorhanden: !!supabaseAnonKey,
  });
  console.error('%c[DB] FEHLER: Supabase-Umgebungsvariablen fehlen.', 'color:#ef4444;font-weight:bold');
  console.error('%c[DB] Hinweis: .env-Datei prüfen. VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY müssen gesetzt sein.', 'color:#f59e0b');
  console.error('%c[DB] Hinweis: One-Click-Installer ausfuehren, um PostgreSQL automatisch einzurichten.', 'color:#f59e0b');
  throw new Error('Supabase-Umgebungsvariablen fehlen. .env-Datei oder Installer prüfen.');
}

logInit('Supabase-Client wird erstellt...');
logInit(`URL: ${supabaseUrl.slice(0, 30)}...`);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Verbindungs-Verifikation mit ausfuehrlicher Fehlerdiagnose
let _connectionChecked = false;
let _connectionOk = false;

export async function checkConnection(): Promise<boolean> {
  if (_connectionChecked) return _connectionOk;
  _connectionChecked = true;

  try {
    const { error } = await supabase.from('system_settings').select('key').limit(1);
    if (error) {
      _connectionOk = false;
      dbLog('error', 'init', 'Datenbankverbindung fehlgeschlagen', {
        fehler: error.message,
        code: error.code,
      });
      console.error('%c[DB] FEHLER: Datenbank nicht erreichbar.', 'color:#ef4444;font-weight:bold');
      console.error('%c[DB] Hinweis: PostgreSQL-Dienst prüfen (net start postgresql-x64-17 / systemctl start postgresql)', 'color:#f59e0b');
      console.error('%c[DB] Hinweis: .env-Datei prüfen (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)', 'color:#f59e0b');
      console.error('%c[DB] Hinweis: One-Click-Installer ausfuehren, um PostgreSQL automatisch einzurichten.', 'color:#f59e0b');
      return false;
    }
    _connectionOk = true;
    logOk('init', 'Datenbankverbindung erfolgreich hergestellt');
    return true;
  } catch (e: any) {
    _connectionOk = false;
    const desc = describeError(e);
    dbLog('error', 'init', 'Verbindungsfehler zur Datenbank', { fehler: desc, exception: e });
    console.error('%c[DB] FEHLER: Verbindung zur Datenbank fehlgeschlagen: ' + desc, 'color:#ef4444;font-weight:bold');
    if (e instanceof Error && e.stack) {
      console.error('%c[DB] Stacktrace:', 'color:#ef4444', e.stack);
    }
    console.error('%c[DB] Hinweis: PostgreSQL-Dienst und .env-Konfiguration prüfen.', 'color:#f59e0b');
    return false;
  }
}

// Verbindung asynchron prüfen (nicht-blockierend)
checkConnection().catch((e) => {
  dbLog('error', 'init', 'Unerwarteter Fehler bei Verbindungsprüfung', { fehler: describeError(e) });
});

logInit('Supabase-Client erstellt');
