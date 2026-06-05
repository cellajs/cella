import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.git/**', 'config/config.test.ts'],
    fileParallelism: true,
  },
});
