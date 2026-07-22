import type { UserConfig } from '@hey-api/openapi-ts';
import { defineConfig } from '@hey-api/openapi-ts';
import { defineConfig as openapiParserPlugin } from './src/plugins/openapi-parser/index';
import { defineConfig as tsdocPlugin } from './src/plugins/tsdoc';

/**
 * Generate the SDK from cached OpenAPI. The incremental wrapper targets a staging directory
 * first so identical output does not trigger writes or HMR.
 */
export const openApiConfig: UserConfig = {
  input: {
    path: '../backend/openapi.cache.json',
    watch: false,
  },
  output: {
    path: './gen',
    source: {
      fileName: 'openapi',
      path: './gen',
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
};

export default defineConfig(openApiConfig);
