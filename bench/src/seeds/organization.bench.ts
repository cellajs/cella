import { registerBenchSeed } from '../registry';
import { loadtestOrganization } from './organization';

registerBenchSeed({
  table: 'organizations',
  order: 40,
  cleanupWhere: `id::text LIKE '00000000-0000-4000-a001%'`,
  rows: ({ now }) => [{ ...loadtestOrganization(), createdAt: now }],
});
