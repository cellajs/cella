import type { InsertOrganizationModel } from '#/modules/organization/organization-db';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { ORG_ID, TENANT_ID } from './ids';

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
