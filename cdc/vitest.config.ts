import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for CDC worker tests.
 * Unit tests only - no database connection required.
 */
export default defineConfig({
  resolve: {
    alias: {
      '#': path.resolve(__dirname, '../backend/src'),
    },
  },
  logLevel: 'error',
  test: {
    testTimeout: 10000,
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
    },
  },
});
