import type { DeepPartial } from '../src/config-builder/types.ts';
import type { config } from './config.default.ts';

export const production = {
  singleVM: true,
} satisfies DeepPartial<typeof config>;
