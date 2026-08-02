// Erweiterte Konsolenprotokollierung fuer die Browser-Konsole.
// Alle Datenbank- und Auth-Operationen leiten ihre Fehler ueber dieses Modul,
// so dass Probleme mit vollem Kontext sichtbar werden.
//
// Farb-Konvention:
//   Gruen  = Erfolg / OK
//   Gelb   = Warnung
//   Rot    = Fehler
//   Blau   = Information

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const COLORS: Record<LogLevel, string> = {
  error: 'color:#ef4444;font-weight:bold',
  warn: 'color:#f59e0b;font-weight:bold',
  info: 'color:#3b82f6;font-weight:bold',
  debug: 'color:#64748b',
};

const OK_COLOR = 'color:#22c55e;font-weight:bold';
const TAG = '[DB]';

function describeError(err: unknown): string {
  if (!err) return 'Unbekannter Fehler';
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, any>;
    if (obj.message) return obj.message;
    if (obj.error_description) return obj.error_description;
    if (obj.msg) return obj.msg;
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err);
}

function hintForError(msg: string): string | null {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('password')) return 'Passwort oder Email ist falsch.';
  if (m.includes('user not found') || m.includes('benutzer')) return 'Benutzer existiert nicht oder ist deaktiviert.';
  if (m.includes('database') && m.includes('not') && m.includes('exist')) return 'Datenbank existiert nicht. Installer erneut ausfuehren.';
  if (m.includes('econnrefused') || m.includes('network') || m.includes('fetch')) return 'Datenbank nicht erreichbar. PostgreSQL-Dienst pruefen.';
  if (m.includes('permission') || m.includes('denied')) return 'Fehlende Berechtigungen. Benutzerrechte in PostgreSQL pruefen.';
  if (m.includes('port') && m.includes('use')) return 'Port ist bereits belegt. Anderen Port konfigurieren oder Dienst stoppen.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Zu viele Anfragen. Spaeter erneut versuchen.';
  if (m.includes('jwt') || m.includes('token') || m.includes('expired')) return 'Sitzung abgelaufen. Bitte neu anmelden.';
  if (m.includes('timeout')) return 'Zeitueberschreitung bei der Datenbankabfrage. Verbindung pruefen.';
  if (m.includes('unique') || m.includes('duplicate')) return 'Doppelter Eintrag. Wert bereits vorhanden.';
  if (m.includes('foreign key') || m.includes('violat')) return 'Referenz auf nicht existierenden Datensatz.';
  return null;
}

export function dbLog(level: LogLevel, operation: string, message: string, context?: Record<string, unknown>): void {
  const prefix = `${TAG} ${operation}`;

  if (level === 'error') {
    const hint = hintForError(message);
    console.group(`%c${prefix} FEHLER`, COLORS.error);
    console.error(message);
    if (context) console.error('Kontext:', context);
    if (context?.error) {
      const desc = describeError(context.error);
      if (desc !== message) console.error('Fehlerdetails:', desc);
    }
    if (context?.error instanceof Error) {
      console.error('Stacktrace:', (context.error as Error).stack);
    }
    if (hint) console.error('%cHinweis: ' + hint, COLORS.warn);
    console.groupEnd();
  } else if (level === 'warn') {
    console.group(`%c${prefix} WARNUNG`, COLORS.warn);
    console.warn(message);
    if (context) console.warn('Kontext:', context);
    console.groupEnd();
  } else if (level === 'info') {
    console.log(`%c${prefix}`, COLORS.info, message, context ?? '');
  } else if (level === 'ok') {
    console.log(`%c${prefix} OK`, OK_COLOR, message);
  } else {
    console.log(`%c${prefix}`, COLORS.debug, message, context ?? '');
  }
}

export function logQuery(table: string, operation: string, durationMs: number, error?: string): void {
  if (error) {
    dbLog('error', operation, `Abfrage auf "${table}" fehlgeschlagen: ${error}`, { table, durationMs });
  } else if (durationMs > 500) {
    dbLog('warn', operation, `Langsame Abfrage auf "${table}" (${durationMs}ms)`, { table, durationMs });
  } else {
    dbLog('debug', operation, `"${table}" in ${durationMs}ms`);
  }
}

export function logAuth(operation: string, success: boolean, error?: string): void {
  if (error) {
    dbLog('error', `auth.${operation}`, error);
  } else if (success) {
    dbLog('ok', `auth.${operation}`, 'Erfolgreich');
  } else {
    dbLog('info', `auth.${operation}`, 'Kein Ergebnis');
  }
}

export function logInit(message: string): void {
  console.log(`%c${TAG} ${message}`, COLORS.info);
}

export function logOk(operation: string, message: string): void {
  dbLog('ok', operation, message);
}

export { describeError, hintForError };
