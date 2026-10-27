// Load backend/.env so DB_TEST_PORT (app-specific) is available; in CI it's set directly in process.env.
import process from 'node:process';

try {
  process.loadEnvFile(new URL('../../backend/.env', import.meta.url));
} catch {
  // CI and other environments without .env must provide DB_TEST_PORT through process.env.
}

// biome-ignore lint/style/noProcessEnv: test bootstrap runs before any env module exists; CI provides DB_TEST_PORT directly
const port = process.env.DB_TEST_PORT;
if (!port) {
  throw new Error('DB_TEST_PORT is required (set it in backend/.env or the environment) to run database tests.');
}

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
// biome-ignore lint/style/noProcessEnv: read before any env module exists, like DB_TEST_PORT
const poolId = process.env.TEST_DB_PER_WORKER ? process.env.VITEST_POOL_ID : undefined;
export const testDatabaseName = poolId ? testWorkerDatabase(poolId) : 'postgres';

/**
 * The database the CDC worker's integration tests own. They drop the slot, change the publication and empty the books,
 * which no other suite should find done to the database it reads. The backend's global setup creates and migrates it.
 */
export const cdcTestDatabase = 'cdc_integration';

// URLs are derived from the required port and the dev roles' names and passwords (mirrors backend/compose.yaml).
const databaseUrl = (role: string, password: string, database: string) => `postgres://${role}:${password}@0.0.0.0:${port}/${database}`;
export const testCdcDatabaseUrl = databaseUrl('postgres', 'postgres', cdcTestDatabase);
export const testDatabaseUrl = databaseUrl('postgres', 'postgres', testDatabaseName);
export const testRuntimeDatabaseUrl = databaseUrl('runtime_role', 'dev_password', testDatabaseName);
export const testAdminRoleDatabaseUrl = databaseUrl('admin_role', 'dev_password', testDatabaseName);
