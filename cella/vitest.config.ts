import { defineProject } from 'vitest/config';

/** The app's checks of its own files against the engine in @cellajs/cli: its env schemas, docs, workflows and shared copies. */
export default defineProject({
  logLevel: 'error',
  test: {
    include: ['tests/**/*.test.ts'],
    // The engine finds the app from the working directory: a run started inside cella/ (an IDE, `pnpm exec`) runs from the app's root too.
    setupFiles: ['./tests/app-root.ts'],
    testTimeout: 5000,
  },
});
