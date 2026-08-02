// Backward-compatibility shim — re-exports from the database/ module.
// This file exists so that existing imports of '@/lib/db' and './db'
// continue to work after the database code was consolidated into ./database.
export {
  supabase,
  db,
  dbReady,
  getDb,
  DB_MODE,
  IS_SUPABASE,
  IS_SQLITE,
  IS_POSTGRES,
  getDbMode,
} from './database';
export type { DbMode } from './database';
