import { registerBenchSeed } from '../registry';
import { TENANT_ID, TOTAL_USERS } from './ids';
import { loadtestOrgMembership } from './membership';

registerBenchSeed({
  table: 'memberships',
  order: 50,
  cleanupWhere: `tenant_id = '${TENANT_ID}'`,
  rows: ({ now }) => Array.from({ length: TOTAL_USERS }, (_, i) => ({ ...loadtestOrgMembership(i), createdAt: now })),
});
