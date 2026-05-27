import type { DeepPartial } from './src/config-builder/types';
import type _default from './default-config';

export default {
  mode: 'development',
  name: 'Cella DEVELOPMENT',
  slug: 'cella-development',

  domain: '',
  frontendUrl: 'http://localhost:3000',
  backendUrl: 'http://localhost:4000',
  backendAuthUrl: 'http://localhost:4000/auth',

  // Hide chat widget in development
  gleapToken: undefined,
} satisfies DeepPartial<typeof _default>;
