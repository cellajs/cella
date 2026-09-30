import type { UserConfig } from '@hey-api/openapi-ts';
import { defineConfig } from '@hey-api/openapi-ts';
import { defineConfig as openapiParserPlugin } from './src/plugins/openapi-parser/index';
import { defineConfig as tsdocPlugin } from './src/plugins/tsdoc';

/**
 * Generation config for one output directory. The incremental wrapper in `src/generate-sdk.ts` targets a
 * staging directory first so identical output does not trigger writes or HMR; the CLI targets `./gen` directly.
 */
export const createOpenApiConfig = (outputPath: string): UserConfig => ({
  input: {
    path: '../backend/openapi.cache.json',
    watch: false,
  },
  output: {
    path: outputPath,
    source: {
      fileName: 'openapi',
      path: outputPath,
    },
  },
  parser: {
    transforms: {
      readWrite: false,
    },
  },
  plugins: [
    tsdocPlugin(),
    openapiParserPlugin(),
    'zod',
    { name: '@hey-api/sdk', responseStyle: 'data', validator: 'zod' },
    {
      name: '@hey-api/client-fetch',
      throwOnError: true,
    },
  ],
});

export default defineConfig(createOpenApiConfig('./gen'));
