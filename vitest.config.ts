import { coverageConfigDefaults, defineConfig } from 'vitest/config';

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
 * pnpm vitest run --coverage      # Run all tests with merged coverage
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
      'sdk',
    ],
    coverage: {
      provider: 'v8',
      // All reporters write under a single `coverage/` directory at the repo root
      // (the default reportsDirectory) — nothing is emitted next to source files.
      // - text-summary: compact 4-line totals in the terminal
      // - html:         browsable coverage/index.html for drill-down
      // - lcov:         coverage/lcov.info for CI / editor coverage tooling
      // - json-summary: coverage/coverage-summary.json consumed by `pnpm cella --stats`
      reporter: ['text-summary', 'html', 'lcov', 'json-summary'],
      include: [
        'backend/src/**/*.ts',
        'cdc/src/**/*.ts',
        'frontend/src/**/*.{ts,tsx}',
        'yjs/src/**/*.ts',
        'shared/**/*.ts',
        'infra/{src,tasks,modules,reconciler,caddy}/**/*.ts',
        'infra/*.ts',
        'sdk/src/**/*.ts',
      ],
      exclude: [
        ...coverageConfigDefaults.exclude,
        '**/*.{test,spec}.ts',
        '**/tests/**',
        '**/mocks/**',
        '**/scripts/**',
        // Generated SDK output — never hand-written, so coverage is meaningless.
        'frontend/src/api.gen/**',
        'sdk/gen/**',
      ],
    },
  },
});
