import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for integration tests.
 * These tests require real Postgres with logical replication support.
 * Run with: pnpm test:integration
 */
export default defineConfig({
  resolve: {
    alias: {
      '#': path.resolve(__dirname, './src'),
      '#json': path.resolve(__dirname, '../json'),
    },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30000, // CDC events can take a moment to propagate
    hookTimeout: 30000,
    env: {
      PINO_LOG_LEVEL: 'info',
      NODE_ENV: 'test',
      INTEGRATION_TEST: 'true',
    },
  },
});
