import type { DeepPartial } from '../src/config-builder/types';
import type { config as _default } from './config.default';

export const staging = {
  mode: 'staging',
  name: 'Cella STAGING',
  slug: 'cella-staging',

  domain: 'cellajs.com',
  // Same-origin like production: services are paths under the staging origin.
  frontendUrl: 'https://staging.cellajs.com',
  backendUrl: 'https://staging.cellajs.com/api',
  backendAuthUrl: 'https://staging.cellajs.com/api/auth',
  yjsUrl: 'wss://staging.cellajs.com/yjs',
  mcpUrl: 'https://staging.cellajs.com/mcp',
} satisfies DeepPartial<typeof _default>;
