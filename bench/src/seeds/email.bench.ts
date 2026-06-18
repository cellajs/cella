import { registerBenchSeed } from '../registry';
import { TOTAL_USERS } from './ids';
import { loadtestEmail } from './user';

registerBenchSeed({
  table: 'emails',
  order: 30,
  cleanupWhere: `id::text LIKE '00000000-0000-4000-a002%'`,
  rows: ({ now }) =>
    Array.from({ length: TOTAL_USERS }, (_, i) => ({ ...loadtestEmail(i), verifiedAt: now, createdAt: now })),
});
