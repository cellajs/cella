import { coverageConfigDefaults, defineConfig } from 'vitest/config';

const coverageReporters =
  process.env.COVERAGE_REPORTERS === 'summary'
    ? ['json-summary']
    : ['text-summary', 'html', 'lcov', 'json-summary'];

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
 * pnpm vitest --project=cella      # Run only the CLI package tests
 * pnpm vitest run --coverage      # Run all tests with merged coverage
 * ```
 *
 * @link https://vitest.dev/guide/projects
 */
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      'backend',
      'bench',
      'cli/cella',
      'shared',
      'yjs',
      'cdc',
      'infra',
      'frontend',
      'sdk',
    ],
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      reporter: coverageReporters,
      include: [
        'backend/src/**/*.ts',
        'bench/src/**/*.ts',
        'cli/cella/src/**/*.ts',
        'cdc/src/**/*.ts',
        'frontend/src/**/*.{ts,tsx}',
        'yjs/src/**/*.ts',
        'shared/**/*.ts',
        'infra/{cli,compose,config,lib,reconciler,resources,tasks,tests}/**/*.ts',
        'infra/*.ts',
        'sdk/src/**/*.ts',
      ],
      exclude: [
        ...coverageConfigDefaults.exclude,
        '**/*.{test,spec}.ts',
        '**/tests/**',
        '**/mocks/**',
        '**/*-mocks.ts',
        '**/scripts/**',
        'sdk/gen/**',
      ],
    },
  },
});
