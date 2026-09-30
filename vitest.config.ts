import { coverageConfigDefaults, defineConfig } from 'vitest/config';

const coverageReporters =
  process.env.COVERAGE_REPORTERS === 'summary'
    ? ['json-summary']
    : ['text-summary', 'html', 'lcov', 'json-summary'];

// Two hours east of UTC (POSIX signs run backwards): a timestamp stored without its zone and parsed in JavaScript fails
// here as on a developer's machine, while production runs UTC. Set on the process before the worker pool starts, since
// `Date` reads the zone from the C library, which a worker's own `process.env` never reaches.
process.env.TZ = 'Etc/GMT-2';

// Unified project list and coverage reporting for the monorepo test command.
export default defineConfig({
  test: {
    passWithNoTests: true,
    // No `project` filter here: with one set, vitest matches `coverage.include` against each
    // project's own root, so the repo-relative globs below match nothing and the coverage
    // summary comes out empty. The frontend config leaves its Storybook browser project out
    // of this run by itself.
    projects: [
      'backend',
      'bench',
      'shared',
      'yjs',
      'cdc',
      'infra',
      'frontend',
      'sdk',
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: '.coverage',
      reportOnFailure: true,
      reporter: coverageReporters,
      include: [
        'backend/src/**/*.ts',
        'bench/src/**/*.ts',
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
