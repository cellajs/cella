import { defineProject } from 'vitest/config';

const testMode = process.env.TEST_MODE || 'core';

// Exclude integration tests unless in full mode
const excludePatterns = ['**/node_modules/**'];
if (testMode === 'core') excludePatterns.push('src/tests/integration/**');

export default defineProject({
  test: {
    name: 'yjs',
    testTimeout: 15000,
    hookTimeout: 15000,
    globalSetup: testMode === 'full' ? './src/tests/integration/global-setup.ts' : undefined,
    include: ['src/**/*.test.ts'],
    exclude: excludePatterns,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      YJS_SECRET: 'test-yjs-secret-for-unit-tests',
      DATABASE_URL: 'postgres://postgres:postgres@0.0.0.0:5434/postgres',
      YJS_PORT: '0',
    },
  },
});
