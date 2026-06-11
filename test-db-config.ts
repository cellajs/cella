// Load backend/.env so DB_TEST_PORT (fork-specific) is available; optional in CI where env is set directly.
try {
  process.loadEnvFile(new URL('./backend/.env', import.meta.url));
} catch {
  // .env not present — fall back to process.env / defaults below.
}

const port = process.env.DB_TEST_PORT ?? '5434';

export const testDatabaseUrl = process.env.DATABASE_TEST_URL ?? `postgres://postgres:postgres@0.0.0.0:${port}/postgres`;

export const testRuntimeDatabaseUrl =
  process.env.TEST_RUNTIME_DATABASE_URL ?? `postgres://runtime_role:dev_password@0.0.0.0:${port}/postgres`;

export const testAdminRoleDatabaseUrl =
  process.env.TEST_ADMIN_ROLE_DATABASE_URL ?? `postgres://admin_role:dev_password@0.0.0.0:${port}/postgres`;
