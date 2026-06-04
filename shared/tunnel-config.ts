import type { DeepPartial } from './src/config-builder/types';
import type _default from './default-config';

export default {
  mode: 'tunnel',
  name: 'Raak TUNNEL',
  slug: 'raak-tunnel',

  frontendUrl: 'https://localhost:3000',
  backendUrl: 'https://raak.ngrok.dev',
  backendAuthUrl: 'https://raak.ngrok.dev/auth',

} satisfies DeepPartial<typeof _default>;
