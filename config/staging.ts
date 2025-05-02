import type { Config } from './default';

export default {
  mode: 'staging',
  name: 'Cella STAGING',
  debug: false,

  domain: 'cella.dev',
  frontendUrl: 'https://cella.dev',
  backendUrl: 'https://api.cella.dev',
  backendAuthUrl: 'https://api.cella.dev/auth',
  electricUrl: 'https://electric.cella.dev',

  // Hide chat widget in staging
  gleapToken: undefined,

  // Payment with Paddle
  paddleToken: 'test_85052d6574ab68d36b341e0afc8',
  paddlePriceIds: {
    donate: 'pri_01hq8da4mn9s0z0da7chh0ntb9',
  },
} satisfies Config;
