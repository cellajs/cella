// Load backend/.env so DB_TEST_PORT (fork-specific) is available; in CI it's set directly in process.env.
try {
  process.loadEnvFile(new URL('../../backend/.env', import.meta.url));
} catch {
  // .env not present (e.g. CI): DB_TEST_PORT must come from process.env instead.
}

const port = process.env.DB_TEST_PORT;
if (!port) {
  throw new Error('DB_TEST_PORT is required (set it in backend/.env or the environment) to run database tests.');
}

// URLs are derived from the required port and the standard dev role credentials (mirrors backend/compose.yaml).
export const testDatabaseUrl = `postgres://postgres:postgres@0.0.0.0:${port}/postgres`;
export const testRuntimeDatabaseUrl = `postgres://runtime_role:dev_password@0.0.0.0:${port}/postgres`;
export const testAdminRoleDatabaseUrl = `postgres://admin_role:dev_password@0.0.0.0:${port}/postgres`;
