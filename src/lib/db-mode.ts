// Re-export from the new database/ module for backward compatibility.
export { DB_MODE, IS_SUPABASE, IS_SQLITE, IS_POSTGRES, getDbMode } from './database';
export type { DbMode } from './database';
