import { getPendingMemberships, getUsers } from 'sdk';
import { afterAll, describe, expect, it } from 'vitest';
import { adminRole, defaultHeaders } from './fixtures';
import { createOrganizationAdminUser, createSystemAdminUser, createTestOrganization, createTestSession, createTestUser } from './helpers';
import { createInvitation } from './invitations/helpers';
import { clearSecurityTestData } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type Page = { items: unknown[]; total: number };

/** A list's `total` counts every row, past the page: the client stops paging once it has fetched `total` rows. */
describe('List totals', async () => {
  const call = await createAppClient();

  afterAll(async () => await clearSecurityTestData());

  it('counts every user, whatever the page size and offset', async () => {
    await clearSecurityTestData();
    const admin = await createSystemAdminUser('total-admin@example.com');
    await createTestUser('total-one@example.com');
    await createTestUser('total-two@example.com');
    const headers = { ...defaultHeaders, Cookie: await createTestSession(admin) };

    for (const query of [
      { limit: 1, offset: 0 },
      { limit: 1, offset: 2 },
    ]) {
      const { data } = await call(getUsers, { query, headers });
      expect(data as Page).toMatchObject({ items: [expect.anything()], total: 3 });
    }
  });

  it('counts every pending invitation, whatever the page size and offset', async () => {
    await clearSecurityTestData();
    const organization = await createTestOrganization();
    const admin = await createOrganizationAdminUser('total-org-admin@example.com', organization.id, adminRole, organization.tenantId);
    for (const email of ['total-a@example.com', 'total-b@example.com', 'total-c@example.com']) {
      await createInvitation({ organization, email, createdBy: admin.id });
    }
    const headers = { ...defaultHeaders, Cookie: await createTestSession(admin) };
    const path = { tenantId: organization.tenantId, organizationId: organization.id };

    for (const page of [
      { limit: 1, offset: 0 },
      { limit: 1, offset: 2 },
    ]) {
      const query = { entityId: organization.id, entityType: 'organization' as const, ...page };
      const { data } = await call(getPendingMemberships, { path, query, headers });
      expect(data as Page).toMatchObject({ items: [expect.anything()], total: 3 });
    }
  });
});
