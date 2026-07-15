import type { DeepPartial } from '../src/config-builder/types';
import type { config as _default } from './config.default';

export const development = {
  mode: 'development',
  name: 'Cella DEVELOPMENT',
  slug: 'cella-development',

  has: {
    selfRegistration: true,
    waitlist: true,
    chatSupport: false,
  },

  domain: '',
  // Same-origin in development too: the Vite dev server proxies /api, /yjs and /mcp
  // to the service ports (vite.config.ts), so cookies and CSP behave like production.
  // Services still listen on their own ports (backend 4000, yjs 4002, mcp 4003).
  frontendUrl: 'http://localhost:3000',
  backendUrl: 'http://localhost:3000/api',
  backendAuthUrl: 'http://localhost:3000/api/auth',
  yjsUrl: 'ws://localhost:3000/yjs',
  mcpUrl: 'http://localhost:3000/mcp',

  // Shared Cella Maps key is referer-restricted to official domains and rejects localhost.
  // Leave empty locally so the contact-form map gracefully skips rendering. Set your own key to enable.
  googleMapsKey: '',

  s3: {
    publicBucket: 'cella-shared-public',
    privateBucket: 'cella-shared-private',
  },
} satisfies DeepPartial<typeof _default>;
