import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'bench',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});