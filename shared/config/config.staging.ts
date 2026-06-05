import type { DeepPartial } from '../src/config-builder/types';
import type _default from './config.default';

export default {
  mode: 'staging',
  name: 'Cella STAGING',
  slug: 'cella-staging',

  domain: 'cellajs.com',
  frontendUrl: 'https://staging.cellajs.com',
  backendUrl: 'https://api-staging.cellajs.com',
  backendAuthUrl: 'https://api-staging.cellajs.com/auth',
} satisfies DeepPartial<typeof _default>;
