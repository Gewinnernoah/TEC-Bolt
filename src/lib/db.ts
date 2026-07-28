// Re-export from the new database/ module for backward compatibility.
// All new code should import from '@/lib/database' directly.
export {
  supabase,
  db,
  dbReady,
  getDb,
  DB_MODE,
  IS_SUPABASE,
  IS_SQLITE,
  getDbMode,
} from './database';
export type { DbMode } from './database';
