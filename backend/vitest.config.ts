import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration.
 * Requires a running Postgres instance. If Postgres is not available,
 * tests will be skipped gracefully (see tests/global-setup.ts).
 * @link https://vitest.dev/config/
 */
export default defineConfig({
  resolve: {
    alias: {
      '#': path.resolve(__dirname, './src'),
      '#json': path.resolve(__dirname, '../json'),
    },
  },
  // Suppress "Sourcemap" warnings from node_modules with broken sourcemaps
  logLevel: 'error',
  test: {
    globalSetup: './tests/global-setup.ts',
    exclude: ['node_modules/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Sequential execution - tests share a database with hardcoded emails
    // (test-user@cella.com, user@cella.com, etc.) causing race conditions with parallel execution.
    fileParallelism: false,
    // Use threads pool for better performance
    pool: 'threads',
    env: {
      PINO_LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      CDC_DISABLED: 'true', // Disable CDC worker during tests
      // Use dedicated test database (port 5434) for isolation from dev database
      DATABASE_URL: 'postgres://postgres:postgres@0.0.0.0:5434/postgres',
    },
  },
});
