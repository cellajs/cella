import { defineProject } from 'vitest/config';

// Cover SDK generation and parser plugins. Root coverage excludes generated output.
export default defineProject({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    fileParallelism: true,
  },
});
