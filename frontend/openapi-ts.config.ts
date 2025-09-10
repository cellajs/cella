import type { UserConfig } from '@hey-api/openapi-ts';
import { defineConfig } from '@hey-api/openapi-ts';
import { defineConfig as TsdocEnhancer } from './src/plugins/hey-api-tsdoc-enhancer';

export const openApiConfig: UserConfig = {
  input: {
    path: '../backend/openapi.cache.json',
    watch: false,
  },
  output: {
    path: './src/api.gen',
    lint: 'biome',
    format: 'biome',
  },
  parser: {
    transforms: {
      readWrite: false,
    },
  },
  plugins: [
    TsdocEnhancer({ myOption: true }),
    'zod',
    { name: '@hey-api/sdk', responseStyle: 'data' },
    {
      name: '@hey-api/client-fetch',
      throwOnError: true,
      runtimeConfigPath: '../api-config',
    },
  ],
};

export default defineConfig(openApiConfig);
