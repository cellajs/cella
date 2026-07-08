import { getAttachments, getOrganization, updateOrganization } from 'sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultHeaders } from '../fixtures';
import type { ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

// Verifies role-based organization permissions and unauthenticated rejection via HTTP.
describe('Permission enforcement via HTTP', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let member: { id: string; email: string; sessionCookie: string };

  beforeAll(async () => {
    mockFetchRequest();

    tenant = await createTestTenant(call, 'perm-test');
    member = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'perm-member', 'member');
  });

  afterAll(async () => {
    await clearSecurityTestData();
  });

  describe('Organization read access', () => {
    it('should allow admin to read organization', async () => {
      const { response } = await call(getOrganization, {
        path: { tenantId: tenant.tenantId, id: tenant.organization.id },
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(response.status).toBe(200);
    });

    it('should allow member to read organization', async () => {
      const { response } = await call(getOrganization, {
        path: { tenantId: tenant.tenantId, id: tenant.organization.id },
        headers: { ...defaultHeaders, Cookie: member.sessionCookie },
      });
      expect(response.status).toBe(200);
    });
  });

  describe('Organization update access', () => {
    it('should allow admin to update organization', async () => {
      const { response } = await call(updateOrganization, {
        path: { tenantId: tenant.tenantId, id: tenant.organization.id },
        body: { name: 'Updated Org Name' },
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(response.status).toBe(200);
    });

    it('should reject member updating organization with 403', async () => {
      const { error, response } = await call(updateOrganization, {
        path: { tenantId: tenant.tenantId, id: tenant.organization.id },
        body: { name: 'Hijacked Name' },
        headers: { ...defaultHeaders, Cookie: member.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });
  });

  describe('Attachment list access by role', () => {
    it('should allow admin to list attachments', async () => {
      const { response } = await call(getAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(response.status).toBe(200);
    });

    it('should allow member to list attachments', async () => {
      const { response } = await call(getAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        headers: { ...defaultHeaders, Cookie: member.sessionCookie },
      });
      expect(response.status).toBe(200);
    });
  });

  describe('Unauthenticated access', () => {
    it('should reject unauthenticated GET attachments with 401', async () => {
      const { response } = await call(getAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        headers: defaultHeaders,
      });
      expect(response.status).toBe(401);
    });

    it('should reject unauthenticated GET organization with 401', async () => {
      const { response } = await call(getOrganization, {
        path: { tenantId: tenant.tenantId, id: tenant.organization.id },
        headers: defaultHeaders,
      });
      expect(response.status).toBe(401);
    });
  });
});
