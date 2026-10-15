import type { DeepPartial } from '../src/config-builder/types.ts';
import type { config as _default } from './config.default.ts';

export const production = {
  mode: 'production',
  maintenance: false,

  singleVM: true,
} satisfies DeepPartial<typeof _default>;
