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

// URLs are derived from the required port and the standard dev role credentials (mirrors backend/compose.yaml).
export const testDatabaseUrl = `postgres://postgres:postgres@0.0.0.0:${port}/${testDatabaseName}`;
export const testRuntimeDatabaseUrl = `postgres://runtime_role:dev_password@0.0.0.0:${port}/${testDatabaseName}`;
export const testAdminRoleDatabaseUrl = `postgres://admin_role:dev_password@0.0.0.0:${port}/${testDatabaseName}`;
