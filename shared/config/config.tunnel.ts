import type { DeepPartial } from '../src/config-builder/types.ts';
import { config } from './config.default.ts';

export const tunnel = {
  name: `${config.name} TUNNEL`,
  slug: `${config.slug}-tunnel`,

  domain: '',
  // The tunnel fronts the Vite dev server, which proxies the service paths to the service ports. One public origin
  // keeps cookies first-party, so no SameSite=None is needed.
  origin: `https://${config.slug}.ngrok.dev`,
} satisfies DeepPartial<typeof config>;
