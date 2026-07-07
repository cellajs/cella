import type { DeepPartial } from '../src/config-builder/types';
import type { config as _default } from './config.default';
import { development } from './config.development';

/**
 * Ensure that this file does not include or use any sensitive information.
 * This file is used in the test environment and should not contain any production/staging/development secrets.
 * Use it to override default settings for testing purposes.
 * Make sure to keep it minimal and focused on the test environment (must run on localhost).
 */
export const test = {
  mode: 'test',
  name: 'Raak TEST',

  domain: '',

  frontendUrl: development.frontendUrl,
  backendUrl: development.backendUrl,
  backendAuthUrl: development.backendAuthUrl,
  yjsUrl: development.yjsUrl,
  mcpUrl: development.mcpUrl,
  services: {
    yjs: { enabled: true },
  },
} satisfies DeepPartial<typeof _default>;
