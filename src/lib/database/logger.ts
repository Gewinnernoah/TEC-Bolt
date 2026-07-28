// Enhanced logging for the browser console / dev tools.
// All database operations route their errors through this module so
// problems are visible in the console with full context.

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const COLORS: Record<LogLevel, string> = {
  error: 'color:#ef4444;font-weight:bold',
  warn: 'color:#f59e0b;font-weight:bold',
  info: 'color:#3b82f6;font-weight:bold',
  debug: 'color:#64748b',
};

const TAG = '[DB]';

export function dbLog(level: LogLevel, operation: string, message: string, context?: Record<string, unknown>): void {
  const prefix = `${TAG} ${operation}`;
  const detail = context ? `\n  ${JSON.stringify(context)}` : '';

  if (level === 'error') {
    console.group(`%c${prefix} ERROR`, COLORS.error);
    console.error(message);
    if (context) console.error('Context:', context);
    if (context?.error instanceof Error) {
      console.error('Stack:', (context.error as Error).stack);
    }
    console.groupEnd();
  } else if (level === 'warn') {
    console.group(`%c${prefix} WARN`, COLORS.warn);
    console.warn(message);
    if (context) console.warn('Context:', context);
    console.groupEnd();
  } else if (level === 'info') {
    console.log(`%c${prefix}`, COLORS.info, message, context ?? '');
  } else {
    console.log(`%c${prefix}`, COLORS.debug, message, context ?? '');
  }
}

export function logQuery(table: string, operation: string, durationMs: number, error?: string): void {
  if (error) {
    dbLog('error', operation, `Query failed on "${table}": ${error}`, { table, durationMs });
  } else if (durationMs > 500) {
    dbLog('warn', operation, `Slow query on "${table}" took ${durationMs}ms`, { table, durationMs });
  } else {
    dbLog('debug', operation, `"${table}" in ${durationMs}ms`);
  }
}

export function logAuth(operation: string, success: boolean, error?: string): void {
  if (error) {
    dbLog('error', `auth.${operation}`, error);
  } else {
    dbLog('info', `auth.${operation}`, success ? 'success' : 'no result');
  }
}

export function logInit(message: string): void {
  console.log(`%c${TAG} ${message}`, COLORS.info);
}
