import { defineProject } from 'vitest/config';

export default defineProject({
  logLevel: 'error',
  test: {
    include: [
      'agent/**/*.test.ts',
      'cli/**/*.test.ts',
      'compose/**/*.test.ts',
      'tasks/**/*.test.ts',
      'lib/**/*.test.ts',
      'tests/**/*.test.ts',
      'resources/**/*.test.ts',
      '*.test.ts',
    ],
    exclude: ['node_modules/**', 'dist/**'],
    testTimeout: 5000,
  },
});
