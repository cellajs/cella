import type { UserConfig } from '@hey-api/openapi-ts';
import { defineConfig } from '@hey-api/openapi-ts';

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
  plugins: [
    'zod',
    { name: '@hey-api/sdk', responseStyle: 'data' },
    {
      name: '@hey-api/client-fetch',
      throwOnError: true,
      runtimeConfigPath: './src/api-config.ts',
    },
  ],
};

export default defineConfig(openApiConfig);
