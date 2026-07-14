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
  // Overrides the default's api.cellajs.com entry (that host belongs to the
  // production stack); inherited yjs/mcp entries are ignored — those services
  // are disabled here and never had staging hosts.
  legacyUrls: { backend: 'https://api-staging.cellajs.com' },
} satisfies DeepPartial<typeof _default>;
