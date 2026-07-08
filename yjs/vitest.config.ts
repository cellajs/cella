import path from 'node:path';
import { defineProject } from 'vitest/config';
import { testDatabaseUrl } from 'shared/test-db';

const testMode = process.env.TEST_MODE || 'core';

// Exclude integration tests unless in full mode
const excludePatterns = ['**/node_modules/**'];
if (testMode === 'core') excludePatterns.push('src/tests/integration/**');

export default defineProject({
  resolve: {
    alias: {
      '#': path.resolve(__dirname, '../backend/src'),
    },
  },
  test: {
    name: 'yjs',
    testTimeout: 15000,
    hookTimeout: 15000,
    globalSetup: testMode === 'full' ? './src/tests/integration/global-setup.ts' : undefined,
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: excludePatterns,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      YJS_SECRET: 'test-yjs-secret-for-unit-tests',
      DATABASE_URL: testDatabaseUrl,
      YJS_PORT: '0',
    },
  },
});
