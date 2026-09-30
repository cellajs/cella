import { defineConfig, type TestProjectConfiguration } from 'vitest/config'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import path from 'node:path'

// The Storybook browser project needs Playwright browsers plus a Storybook server, so it only
// joins runs started from this directory (`pnpm test:storybook`, the CI storybook-test job).
// The root config loads this file as a nested project and runs the node and unit projects.
const standaloneRun = path.resolve(process.cwd()) === import.meta.dirname

export default defineConfig({
  // vitest does not load vite.config.ts, so build-time literals are repeated here.
  define: {
    __DEV_TOOLS__: 'true',
  },
  // Top-level alias so this config also works when invoked as a single project
  // from the root vitest config.
  resolve: {
    alias: {
      '~': path.resolve(import.meta.dirname, './src'),
      '#json': path.resolve(import.meta.dirname, '../json'),
    },
  },
  test: {
    passWithNoTests: true,
    // Keeps console noise silenced in both the root and standalone test runs. Env
    // stays node (most src tests stub their own window); DOM tests opt in per-file
    // with `// @vitest-environment jsdom`.
    setupFiles: ['./vitest.setup.ts'],
    projects: [
      // Node-side tests (vite plugins, helpers, etc.)
      {
        test: {
          name: 'node',
          include: ['vite/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      // Unit tests for frontend src (query, modules, etc.)
      {
        extends: true,
        test: {
          name: 'unit',
          // `.tsx` included so component/registry tests are collected in the
          // standalone run too. Env stays node; DOM tests opt in per-file with
          // `// @vitest-environment jsdom`.
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'node',
          setupFiles: ['./vitest.setup.ts'],
        },
        resolve: {
          alias: {
            '~': path.resolve(import.meta.dirname, './src'),
            '#json': path.resolve(import.meta.dirname, '../json'),
          },
        },
      },
      // Storybook browser tests
      ...(standaloneRun
        ? ([
          {
            extends: true,
            plugins: [
              storybookTest({
                configDir: path.join(import.meta.dirname, '.storybook'),
                storybookScript: 'pnpm storybook --ci',
              }),
            ],

            test: {
              name: 'storybook',
              browser: {
                enabled: true,
                provider: playwright({}),
                headless: true,
                viewport: { width: 1280, height: 720 },
                instances: [{ browser: 'chromium' }],
              },
              setupFiles: ['./.storybook/vitest.setup.ts'],
              exclude: ['**/BlockNote.stories.tsx'],
            },
          },
        ] satisfies TestProjectConfiguration[])
        : []),
    ],
  },
})
