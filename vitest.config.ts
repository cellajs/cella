import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for unified monorepo testing.
 *
 * Uses the `projects` feature to run tests across multiple packages with
 * a single command and unified reporting.
 *
 * @example
 * ```bash
 * pnpm vitest                     # Run all package tests
 * pnpm vitest --project=backend   # Run only backend tests
 * ```
 *
 * @link https://vitest.dev/guide/projects
 */
export default defineConfig({
  test: {
    projects: [
      'backend',
      'shared',
      'yjs',
      'cdc',
      'infra',
      'frontend',
    ],
  },
});
