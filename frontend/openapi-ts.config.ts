import { defineConfig } from '@hey-api/openapi-ts';
import { config } from 'config';

export default defineConfig({
  input: { path: `${config.backendUrl}/openapi.json`, watch: true },
  output: 'src/ts-client',
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/hey-api.ts',
    },
  ],
});
