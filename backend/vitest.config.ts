import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from '../test-db-config';

/**
 * Vitest configuration for backend tests.
 *
 * Supports two test modes via TEST_MODE env variable:
 * - `core`: Excludes CDC integration tests (default)
 * - `full`: Complete suite including CDC integration tests
 *
 * @example
 * ```bash
 * TEST_MODE=core pnpm test     # Standard, PostgreSQL (default)
 * TEST_MODE=full pnpm test     # Complete suite with integration tests
 * ```
 */

const testMode = process.env.TEST_MODE || 'core';

const includePatterns = ['src/**/*.test.ts', 'tests/**/*.test.ts', 'mocks/**/*.test.ts'];
const excludePatterns = ['**/node_modules/**'];
if (testMode === 'core') excludePatterns.push('tests/integration/**');

export default defineConfig({
  resolve: {
    alias: {
      '#': path.resolve(__dirname, './src'),
      '#json': path.resolve(__dirname, '../json'),
    },
  },
  logLevel: 'error',
  test: {
    name: 'backend',
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
      YJS_SECRET: 'test-yjs-secret-min16',
      PII_HASH_SECRET: 'test-pii-hash-secret-min16',
      SYSTEM_ADMIN_IP_ALLOWLIST: '*',
      DATABASE_URL: testDatabaseUrl,
    },
  },
});
