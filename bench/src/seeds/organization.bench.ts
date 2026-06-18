import { registerBenchSeed } from '../registry';
import { CORE_ID_VARIANTS } from './ids';
import { loadtestOrganization } from './organization';

registerBenchSeed({
  table: 'organizations',
  order: 40,
  idVariant: CORE_ID_VARIANTS.org,
  rows: ({ now }) => [{ ...loadtestOrganization(), createdAt: now }],
});
