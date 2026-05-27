import type { DeepPartial } from './src/config-builder/types';
import type _default from './default-config';
import development from './development-config';

/**
 * Ensure that this file does not include or use any sensitive information.
 * This file is used in the test environment and should not contain any production/staging/development secrets.
 * Use it to override default settings for testing purposes.
 * Make sure to keep it minimal and focused on the test environment (must run on localhost).
 */
export default {
  mode: 'test',
  name: 'Cella TEST',

  domain: '',

  // Derive URLs from development config so port changes only need to happen in one place
  frontendUrl: development.frontendUrl,
  backendUrl: development.backendUrl,
  backendAuthUrl: development.backendAuthUrl,

  // Hide chat widget in test
  gleapToken: undefined,
} satisfies DeepPartial<typeof _default>;
