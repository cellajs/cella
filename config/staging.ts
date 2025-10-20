import type { Config } from './types';

export default {
  mode: 'staging',
  name: 'Cella STAGING',
  slug: 'cella-staging',
  debug: false,

  domain: 'cella.dev',
  frontendUrl: 'https://staging.cella.dev',
  backendUrl: 'https://api-staging.cella.dev',
  backendAuthUrl: 'https://api-staging.cella.dev/auth',
  electricUrl: 'https://electric-staging.cella.dev',

  // Hide chat widget in staging
  gleapToken: undefined,

  s3BucketPrefix: 'cella-staging',

  // Payment with Paddle
  paddleToken: 'test_85052d6574ab68d36b341e0afc8',
  paddlePriceIds: {
    donate: 'pri_01hq8da4mn9s0z0da7chh0ntb9',
  },
} satisfies Config;
