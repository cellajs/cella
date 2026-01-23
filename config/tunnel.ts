import type { Config } from './types';

export default {
  mode: 'tunnel',
  name: 'Cella TUNNEL',

  frontendUrl: 'https://localhost:3000',
  backendUrl: 'http://cella.ngrok.dev',
  backendAuthUrl: 'https://raak.ngrok.dev/auth',

  s3BucketPrefix: 'cella-tunnel',
} satisfies Config;
