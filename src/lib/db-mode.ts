export type DbMode = 'supabase' | 'mongodb';

export function getDbMode(): DbMode {
  const mode = import.meta.env.VITE_DB_MODE as string | undefined;
  if (mode === 'mongodb') return 'mongodb';
  return 'supabase';
}

export const DB_MODE = getDbMode();
export const IS_SUPABASE = DB_MODE === 'supabase';
export const IS_MONGODB = DB_MODE === 'mongodb';
