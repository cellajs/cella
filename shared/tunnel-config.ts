import type { DeepPartial } from './src/config-builder/types';
import type _default from './default-config';

export default {
  mode: 'tunnel',
  name: 'Cella TUNNEL',

  frontendUrl: 'https://localhost:3000',
  backendUrl: 'http://cella.ngrok.dev',
  backendAuthUrl: 'https://raak.ngrok.dev/auth',

} satisfies DeepPartial<typeof _default>;
