// Re-export from the new database/ module for backward compatibility.
export { createSqliteClient } from './database/sqlite-adapter';
export type { SqliteClient } from './database/sqlite-adapter';
