import type { DeepPartial } from '../src/config-builder/types';
import type _default from './config.default';

export default {
  mode: 'staging',
  name: 'Raak STAGING',
  slug: 'raak-staging',

  domain: 'raak.dev',
  frontendUrl: 'https://staging.raak.dev',
  backendUrl: 'https://api-staging.cella.dev',
  backendAuthUrl: 'https://api-staging.cella.dev/auth',
} satisfies DeepPartial<typeof _default>;
