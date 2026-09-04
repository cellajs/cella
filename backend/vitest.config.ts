import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { testDatabaseUrl, testRuntimeDatabaseUrl } from 'shared/test-db';

const testMode = process.env.TEST_MODE || 'core';
// `runtime` runs the same suite as the RLS-subject runtime_role: the parity proof that
// application authorization does not depend on RLS (the default superuser run bypasses it).
const dbRole = process.env.TEST_DB_ROLE === 'runtime' ? 'runtime' : 'admin';

const includePatterns = ['src/**/*.test.ts', 'tests/**/*.test.ts'];
const excludePatterns = ['**/node_modules/**'];
if (testMode === 'core') excludePatterns.push('tests/integration/**');

export default defineConfig({
  resolve: {
    alias: {
      '#': path.resolve(import.meta.dirname, './src'),
      '#json': path.resolve(import.meta.dirname, '../json'),
    },
  },
  logLevel: 'error',
  test: {
    name: dbRole === 'runtime' ? 'backend-runtime' : 'backend',
    globalSetup: './tests/global-setup.ts',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    pool: 'threads',
    include: includePatterns,
    exclude: excludePatterns,
    env: {
      PINO_LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      COOKIE_SECRET: 'test-cookie-secret-for-unit-tests',
      UNSUBSCRIBE_SECRET: 'test-unsubscribe-secret',
      CDC_SECRET: 'test-cdc-secret-min16chars',
      YJS_SECRET: 'test-yjs-secret-min16',
      PII_HASH_SECRET: 'test-pii-hash-secret-min16',
      DATA_ENCRYPTION_KEY: 'test-data-encryption-key-minimum-32-chars',
      SYSTEM_ADMIN_IP_ALLOWLIST: '*',
      // Presigning is pure local computation, so dummy credentials produce a signable URL.
      // Set here so tests never depend on the S3 keys a developer happens to have in .env.
      S3_ACCESS_KEY_ID: 'test-s3-access-key-id',
      S3_ACCESS_KEY_SECRET: 'test-s3-access-key-secret',
      DATABASE_URL: dbRole === 'runtime' ? testRuntimeDatabaseUrl : testDatabaseUrl,
      // Seeds and admin-only paths use the superuser in both roles; point it at the test DB
      DATABASE_ADMIN_URL: testDatabaseUrl,
    },
  },
});
