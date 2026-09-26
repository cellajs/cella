import { getOrganizations } from 'sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultHeaders } from '../fixtures';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

// Organizations sit outside RLS: the list a user gets is scoped by their memberships in the handler alone.
describe('Defense-in-depth data isolation', async () => {
  const call = await createAppClient();
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    mockFetchRequest();
    tenantA = await createTestTenant(call, 'depth-a');
    tenantB = await createTestTenant(call, 'depth-b');
  });

  afterAll(async () => {
    await clearSecurityTestData();
  });

  it("must not list another tenant's organization via getOrganizations", async () => {
    for (const [own, other] of [
      [tenantA, tenantB],
      [tenantB, tenantA],
    ]) {
      const { data, response } = await call(getOrganizations, {
        headers: { ...defaultHeaders, Cookie: own.sessionCookie },
      });
      expect(response.status).toBe(200);
      const orgIds = (data as { items: { id: string }[] }).items.map((o) => o.id);
      expect(orgIds).toContain(own.organization.id);
      expect(orgIds).not.toContain(other.organization.id);
    }
  });
});
