import { registerBenchSeed } from '../registry';
import { CORE_ID_VARIANTS } from './ids';
import { loadtestEmail } from './user';
import { TOTAL_USERS } from './user.bench';

registerBenchSeed({
  table: 'emails',
  order: 30,
  idVariant: CORE_ID_VARIANTS.email,
  rows: ({ now }) =>
    Array.from({ length: TOTAL_USERS }, (_, i) => ({ ...loadtestEmail(i), verifiedAt: now, createdAt: now })),
});
