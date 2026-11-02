import type { DeepPartial } from '../src/config-builder/types.ts';
import { config } from './config.default.ts';

export const staging = {
  name: `${config.name} STAGING`,
  slug: `${config.slug}-staging`,

  origin: `https://staging.${config.domain}`,
  // Off while the in-process authorization server does not answer on the single-machine host: its health check fails.
  services: { oauth: { enabled: false } },

  singleVM: true,
} satisfies DeepPartial<typeof config>;
