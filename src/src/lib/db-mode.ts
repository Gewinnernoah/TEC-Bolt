export type DbMode = 'supabase' | 'sqlite';

export function getDbMode(): DbMode {
  const mode = import.meta.env.VITE_DB_MODE as string | undefined;
  if (mode === 'sqlite') return 'sqlite';
  return 'supabase';
}

export const DB_MODE = getDbMode();
export const IS_SUPABASE = DB_MODE === 'supabase';
export const IS_SQLITE = DB_MODE === 'sqlite';
