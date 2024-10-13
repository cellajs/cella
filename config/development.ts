import type { Config } from './default';

export default {
  mode: 'development',
  name: 'Raak DEVELOPMENT',
  debug: false,

  // senderIsReceiver: true,

  domain: '',
  frontendUrl: 'http://localhost:3003',
  backendUrl: 'http://localhost:4004',
  backendAuthUrl: 'http://localhost:4004/auth',
  tusUrl: 'http://localhost:1080',
  electricUrl: 'http://localhost:3000',

  // Hide chat widget in development
  gleapToken: undefined,

  // Payment with Paddle
  paddleToken: 'test_85052d6574ab68d36b341e0afc8',
  paddlePriceIds: {
    donate: 'pri_01hq8da4mn9s0z0da7chh0ntb9',
  },
} satisfies Config;
