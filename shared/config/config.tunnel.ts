import type { DeepPartial } from '../src/config-builder/types.ts';
import type { config as _default } from './config.default.ts';

export const tunnel = {
  mode: 'tunnel',
  name: 'Cella TUNNEL',
  slug: 'cella-tunnel',

  // The tunnel fronts the Vite dev server, which proxies /api, /yjs and /mcp to the service
  // ports. One public origin keeps cookies first-party, so no SameSite=None is needed.
  frontendUrl: 'https://cella.ngrok.dev',
  backendUrl: 'https://cella.ngrok.dev/api',
  backendAuthUrl: 'https://cella.ngrok.dev/api/auth',
  yjsUrl: 'wss://cella.ngrok.dev/yjs',
  mcpUrl: 'https://cella.ngrok.dev/mcp',
} satisfies DeepPartial<typeof _default>;
