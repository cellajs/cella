import process from 'node:process';
import { localDatabaseUrl } from './local-database.ts';

/** The database a backend test worker owns, by its `VITEST_POOL_ID`, so files in parallel workers never share rows. */
export const testWorkerDatabase = (poolId: number | string) => `backend_worker_${poolId}`;

/** `url` with its database swapped for `database`. */
export const withDatabase = (url: string, database: string) => {
  const next = new URL(url);
  next.pathname = `/${database}`;
  return next.toString();
};

// Inside a backend test worker (TEST_DB_PER_WORKER, set by backend/vitest.config.ts) the worker's own database; in the
// main process and the yjs and cdc tests the shared `postgres`.
// biome-ignore lint/style/noProcessEnv: read before any env module exists
const poolId = process.env.TEST_DB_PER_WORKER ? process.env.VITEST_POOL_ID : undefined;
export const testDatabaseName = poolId ? testWorkerDatabase(poolId) : 'postgres';

/**
 * The database the CDC worker's integration tests own. They drop the slot, change the publication and empty the books,
 * which no other suite should find done to the database it reads. The backend's global setup creates and migrates it.
 */
export const cdcTestDatabase = 'cdc_integration';

export const testCdcDatabaseUrl = localDatabaseUrl('test', 'postgres', cdcTestDatabase);
export const testDatabaseUrl = localDatabaseUrl('test', 'postgres', testDatabaseName);
export const testRuntimeDatabaseUrl = localDatabaseUrl('test', 'runtime_role', testDatabaseName);
export const testAdminRoleDatabaseUrl = localDatabaseUrl('test', 'admin_role', testDatabaseName);
