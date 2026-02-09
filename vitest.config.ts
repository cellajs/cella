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
      // Reference folders directly - Vitest picks up their vitest.config.ts
      'backend',
      'shared',
      // Frontend: inline config for node tests only (Storybook tests run separately)
      {
        test: {
          name: 'frontend',
          root: './frontend',
          include: ['vite/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['./vitest.setup.ts'],
          passWithNoTests: true,
        },
      },
    ],
  },
});
