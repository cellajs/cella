import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration.
 * - Unit tests: `pnpm test` (excludes integration tests, CDC disabled)
 * - Integration tests: `pnpm test:integration` (CDC-specific tests)
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
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    pool: 'threads',
    env: {
      PINO_LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://postgres:postgres@0.0.0.0:5434/postgres',
    },
  },
});
