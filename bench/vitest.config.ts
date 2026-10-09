import path from 'node:path';
import { defineProject } from 'vitest/config';

export default defineProject({
  // The bench imports backend modules by the backend's own alias, as its tsconfig maps them.
  resolve: {
    alias: {
      '#': path.resolve(import.meta.dirname, '../backend/src'),
      '#json': path.resolve(import.meta.dirname, '../json'),
    },
  },
  test: {
    name: 'bench',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
