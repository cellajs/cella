import type { UserConfig } from '@hey-api/openapi-ts';
import { defineConfig } from '@hey-api/openapi-ts';
import { defineConfig as tsdocPlugin } from './src/plugins/tsdoc';

/**
 * Generation config for one output directory. The incremental wrapper in `src/generate-sdk.ts` targets a
 * staging directory first so identical output does not trigger writes or HMR, and copies the spec into it; the CLI
 * targets `./gen` directly and leaves out `openapi.json`.
 */
export const createOpenApiConfig = (outputPath: string): UserConfig => ({
  input: { path: '../backend/openapi.cache.json', watch: false },
  output: { path: outputPath },
  parser: { transforms: { readWrite: false } },
  plugins: [
    tsdocPlugin(),
    'zod',
    // A caller sets its own auth header and the server validates requests: see the README.
    { name: '@hey-api/sdk', auth: false, responseStyle: 'data', validator: { request: false, response: 'zod' } },
    { name: '@hey-api/client-fetch', throwOnError: true },
  ],
});

export default defineConfig(createOpenApiConfig('./gen'));
