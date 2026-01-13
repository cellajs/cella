import { defineConfig } from 'vitest/config'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      // Node-side tests (vite plugins, helpers, etc.)
      {
        test: {
          name: 'node',
          include: ['vite/**/*.test.ts'],
          environment: 'node',
        },
      },
      // Storybook browser tests
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
            storybookScript: 'pnpm storybook --ci',
          }),
        ],

        test: {
          browser: {
            enabled: true,
            provider: playwright({}),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
          setupFiles: ['./.storybook/vitest.setup.ts'],
          exclude: ['**/BlockNote.stories.tsx'],
        },
      },
    ],
  },
})
