export type DbMode = 'supabase' | 'pglite';

export function getDbMode(): DbMode {
  const mode = import.meta.env.VITE_DB_MODE as string | undefined;
  if (mode === 'pglite') return 'pglite';
  return 'supabase';
}

export const DB_MODE = getDbMode();
export const IS_SUPABASE = DB_MODE === 'supabase';
export const IS_PGLITE = DB_MODE === 'pglite';
