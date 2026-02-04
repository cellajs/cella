import type { DeepPartial } from './src/builder/types';
import type _default from './default-config';

/**
 * Ensure that this file does not include or use any sensitive information.
 * This file is used in the test environment and should not contain any production/staging/development secrets.
 * Use it to override default settings for testing purposes.
 * Make sure to keep it minimal and focused on the test environment (must run on localhost).
 */
export default {
  mode: 'test',
  name: 'Cella TEST',
  debug: false,

  domain: '',
  frontendUrl: 'http://localhost:3000',
  backendUrl: 'http://localhost:4000',
  backendAuthUrl: 'http://localhost:4000/auth',

  s3: {
    bucketPrefix: 'cella-test',
  },

  // Hide chat widget in test
  gleapToken: undefined,

  // Payment with Paddle
  paddleToken: '',
  paddlePriceIds: {
    donate: '',
  },

} satisfies DeepPartial<typeof _default>;
