import { PGlite } from '@electric-sql/pglite';
import schemaSql from './pglite-schema.sql?raw';

let dbInstance: PGlite | null = null;
let schemaInitialized = false;

export async function getDb(): Promise<PGlite> {
  if (dbInstance) return dbInstance;
  dbInstance = new PGlite('idb://techub-db');
  await dbInstance.waitForReady;

  if (!schemaInitialized) {
    await dbInstance.exec(schemaSql);
    schemaInitialized = true;
  }

  return dbInstance;
}
