import type { DeepPartial } from './src/config-builder/types';
import type _default from './default-config';

export default {
  mode: 'staging',
  name: 'Cella STAGING',
  slug: 'cella-staging',

  domain: 'cella.dev',
  frontendUrl: 'https://staging.cella.dev',
  backendUrl: 'https://api-staging.cella.dev',
  backendAuthUrl: 'https://api-staging.cella.dev/auth',

  // Hide chat widget in staging
  gleapToken: undefined,
} satisfies DeepPartial<typeof _default>;
