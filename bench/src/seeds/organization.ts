import type { InsertOrganizationModel } from '#/modules/organization/organization-db';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { ORG_ID, TENANT_ID } from './ids';

/**
 * Generate the load-test organization row, using backend mocks for a
 * type-safe entity. Overrides id, tenantId, slug, and name for a deterministic
 * row. Runs in Node.js (data-setup), not in Artillery scenarios.
 */
export const loadtestOrganization = (): InsertOrganizationModel => {
  const record = mockOrganization();
  return {
    ...record,
    id: ORG_ID,
    tenantId: TENANT_ID,
    name: 'Load Test Organization',
    slug: 'xbench-org',
    defaultLanguage: 'en',
    languages: ['en'],
    authStrategies: [],
    chatSupport: false,
  };
};
