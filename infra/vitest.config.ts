import { defineProject } from 'vitest/config';

/** The app's checks of its own files against the engine in @cellajs/cli: its env schemas, docs, workflows and shared copies. */
export default defineProject({
  logLevel: 'error',
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**'],
    testTimeout: 5000,
  },
});
