import type { Config } from './default';

export default {
  mode: 'tunnel',
  name: 'Cella TUNNEL',
  
  frontendUrl: 'https://localhost:3000',
  backendUrl: 'http://cella.ngrok.dev',
  backendAuthUrl: 'https://raak.ngrok.dev/auth',
  electricUrl: 'http://localhost:4200',

  s3BucketPrefix: 'cella-tunnel',
} satisfies Config;
