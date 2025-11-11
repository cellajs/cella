import type { UserConfig } from '@hey-api/openapi-ts';
import { defineConfig } from '@hey-api/openapi-ts';
import { defineConfig as tsdocPlugin } from './vite/tsdoc-plugin';

export const openApiConfig: UserConfig = {
  input: {
    path: '../backend/openapi.cache.json',
    watch: false,
  },
  output: {
    path: './src/api.gen',
    lint: null,
    format: null,
  },
  parser: {
    transforms: {
      readWrite: false,
    },
  },
  plugins: [
    tsdocPlugin(),
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
