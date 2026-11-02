import type { DeepPartial } from '../src/config-builder/types.ts';
import { config } from './config.default.ts';
import { development } from './config.development.ts';

/** The development stack under a name of its own, with every service on so the suite covers each. Never a secret here. */
export const test = {
  ...development,
  name: `${config.name} TEST`,
  slug: `${config.slug}-test`,
  services: { ...development.services, yjs: { enabled: true } },
} satisfies DeepPartial<typeof config>;
