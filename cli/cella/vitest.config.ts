import { resolve } from 'node:path';
import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: {
      '#': resolve(__dirname, './src'),
    },
  },
  test: {
    name: 'cella',
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 30000,
    fileParallelism: true,
  },
});
