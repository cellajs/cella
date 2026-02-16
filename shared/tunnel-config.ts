import type { DeepPartial } from './src/builder/types';
import type _default from './default-config';

export default {
  mode: 'tunnel',
  name: 'Cella TUNNEL',

  frontendUrl: 'https://localhost:3000',
  backendUrl: 'http://cella.ngrok.dev',
  backendAuthUrl: 'https://raak.ngrok.dev/auth',

  s3: {
    bucketPrefix: 'cella-tunnel',
  },
} satisfies DeepPartial<typeof _default>;
