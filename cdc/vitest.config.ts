import path from 'node:path';
import { defineProject } from 'vitest/config';
import { testDatabaseUrl } from 'shared/test-db';

const testMode = process.env.TEST_MODE || 'core';

// Exclude integration tests unless in full mode (same gating as the yjs worker)
const excludePatterns = ['**/node_modules/**'];
if (testMode === 'core') excludePatterns.push('src/tests/integration/**');

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
    exclude: excludePatterns,
    fileParallelism: true,
    env: {
      NODE_ENV: 'test',
      DATABASE_CDC_URL: testDatabaseUrl,
      CDC_SECRET: 'test-cdc-secret-min16chars',
      // Backpressure integration test points the worker's WS client at a local stub server.
      API_WS_URL: 'ws://127.0.0.1:4788/internal/cdc',
    },
  },
});
