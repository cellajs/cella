import type { DeepPartial } from '../src/config-builder/types';
import type { config as _default } from './config.default';

export const tunnel = {
  mode: 'tunnel',
  name: 'Cella TUNNEL',
  slug: 'cella-tunnel',

  // The tunnel fronts the Vite dev server, which proxies /api, /yjs and /mcp to the
  // service ports — one public origin, so cookies stay first-party (no SameSite=None).
  frontendUrl: 'https://cella.ngrok.dev',
  backendUrl: 'https://cella.ngrok.dev/api',
  backendAuthUrl: 'https://cella.ngrok.dev/api/auth',
  yjsUrl: 'wss://cella.ngrok.dev/yjs',
  mcpUrl: 'https://cella.ngrok.dev/mcp',
} satisfies DeepPartial<typeof _default>;
