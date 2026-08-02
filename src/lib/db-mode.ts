// Backward-compatibility shim — re-exports from the database/ module.
export { DB_MODE, IS_SUPABASE, IS_SQLITE, IS_POSTGRES, getDbMode } from './database';
export type { DbMode } from './database';
