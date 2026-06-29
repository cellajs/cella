import { registerBenchSeed } from '../registry';
import { CORE_ID_VARIANTS } from './ids';
import { loadtestUser } from './user';

export const TOTAL_USERS = 1200;

registerBenchSeed({
  table: 'users',
  order: 20,
  idVariant: CORE_ID_VARIANTS.user,
  rows: ({ now }) => Array.from({ length: TOTAL_USERS }, (_, i) => ({ ...loadtestUser(i), createdAt: now })),
});
