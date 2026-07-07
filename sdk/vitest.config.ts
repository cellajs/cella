import { defineProject } from 'vitest/config';

/**
 * Vitest configuration for the SDK package.
 *
 * Covers the custom generation logic (`generate-sdk.ts`) and the OpenAPI
 * parser / tsdoc plugins. The generated output in `gen/` is never tested
 * directly: it is excluded from coverage at the root config.
 */
export default defineProject({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    fileParallelism: true,
  },
});
