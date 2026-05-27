import path from 'node:path';
import { defineProject } from 'vitest/config';

/**
 * Vitest configuration for CDC worker tests.
 * Unit tests only - no database connection required.
 */
export default defineProject({
  resolve: {
    alias: {
      '#': path.resolve(__dirname, '../backend/src'),
    },
  },
  logLevel: 'error',
  test: {
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 10000,
    include: ['src/**/*.test.ts'],
    fileParallelism: true,
    env: {
      NODE_ENV: 'test',
      DATABASE_CDC_URL: 'postgres://postgres:postgres@0.0.0.0:5434/postgres',
      CDC_SECRET: 'test-cdc-secret-min16chars',
    },
  },
});
