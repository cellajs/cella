import type { DeepPartial } from '../src/config-builder/types';
import type _default from './config.default';

export default {
  mode: 'tunnel',
  name: 'Cella TUNNEL',
  slug: 'cella-tunnel',

  frontendUrl: 'https://localhost:3000',
  backendUrl: 'https://cella.ngrok.dev',
  backendAuthUrl: 'https://cella.ngrok.dev/auth',

} satisfies DeepPartial<typeof _default>;
