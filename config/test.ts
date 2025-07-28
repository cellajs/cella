import type { Config } from './default';

export default {
  mode: 'test',
  name: 'Cella TEST',
  debug: false,

  domain: '',
  frontendUrl: 'http://localhost:3000',
  backendUrl: 'http://localhost:4000',
  backendAuthUrl: 'http://localhost:4000/auth',
  electricUrl: 'http://localhost:4200',

  s3BucketPrefix: 'cella-development',

  // Hide chat widget in development
  gleapToken: undefined,

  // Payment with Paddle
  paddleToken: 'test_85052d6574ab68d36b341e0afc8',
  paddlePriceIds: {
    donate: 'pri_01hq8da4mn9s0z0da7chh0ntb9',
  },

  // Optional settings
  has: {
    registrationEnabled: true, // Allow users to sign up. If false, the app is by invitation only
  },
} satisfies Config;
