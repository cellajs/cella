import { registerBenchSeed } from '../registry';
import { TOTAL_USERS } from './ids';
import { loadtestUser } from './user';

registerBenchSeed({
  table: 'users',
  order: 20,
  cleanupWhere: `id::text LIKE '00000000-0000-4000-a000%'`,
  rows: ({ now }) => Array.from({ length: TOTAL_USERS }, (_, i) => ({ ...loadtestUser(i), createdAt: now })),
});
