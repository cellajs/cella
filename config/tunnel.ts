import type { Config } from './default';

export default {
  mode: 'tunnel',
  name: 'Cella TUNNEL',
  frontendUrl: 'https://localhost:3000',
  backendUrl: 'http://cella.eu.ngrok.io',

  s3BucketPrefix: 'cella-tunnel',
} satisfies Config;
