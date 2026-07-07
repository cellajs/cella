import type { DeepPartial } from '../src/config-builder/types';
import type { config as _default } from './config.default';

export const tunnel = {
  mode: 'tunnel',
  name: 'Cella TUNNEL',
  slug: 'cella-tunnel',

  frontendUrl: 'https://localhost:3000',
  backendUrl: 'https://cella.ngrok.dev',
  backendAuthUrl: 'https://cella.ngrok.dev/auth',

} satisfies DeepPartial<typeof _default>;
