import { defineProject } from 'vitest/config'

// Default `pnpm test` excludes the integration suite (requires a live host).
// `pnpm test:integration` sets INTEGRATION=1 to opt back in.
const integration = process.env.INTEGRATION === '1'

export default defineProject({
  logLevel: 'error',
  test: {
    include: ['tasks/**/*.test.ts', 'src/**/*.test.ts', 'tests/**/*.test.ts', '*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'policies/**', ...(integration ? [] : ['tests/integration/**'])],
    testTimeout: 5000,
  },
})
