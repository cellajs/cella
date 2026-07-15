import { createAttachments, getAttachments, getOrganization, updateOrganization } from 'sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateMockEntityBodyChannelIdColumns } from '#/mocks';
import { defaultHeaders } from '../fixtures';
import type { ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const attachmentBody = (id: string) => ({
  id,
  filename: 'cross-tenant.pdf',
  contentType: 'application/pdf',
  size: '1024',
  originalKey: `test/cross-tenant-${id}.pdf`,
  bucketName: 'test-bucket',
  // Body-level context ids derived from the hierarchy (empty in cella, e.g. { projectId } in forks).
  ...generateMockEntityBodyChannelIdColumns('attachment'),
  stx: { mutationId: id, sourceId: 'cross-tenant', fieldTimestamps: {} },
});

// Verifies tenant guard isolation for authenticated users across tenants.
describe('Cross-tenant API isolation', async () => {
  const call = await createAppClient();
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    mockFetchRequest();
    tenantA = await createTestTenant(call, 'tenant-a');
    tenantB = await createTestTenant(call, 'tenant-b');
  });

  afterAll(async () => {
    await clearSecurityTestData();
  });

  describe('User A cannot access Tenant B resources', () => {
    it('should reject GET attachments in another tenant with 403', async () => {
      const { error, response } = await call(getAttachments, {
        path: { tenantId: tenantB.tenantId, organizationId: tenantB.organization.id },
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });

    it('should reject GET organization in another tenant with 403', async () => {
      const { error, response } = await call(getOrganization, {
        path: { tenantId: tenantB.tenantId, id: tenantB.organization.id },
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });
  });

  describe('User B cannot access Tenant A resources', () => {
    it('should reject GET attachments in another tenant with 403', async () => {
      const { error, response } = await call(getAttachments, {
        path: { tenantId: tenantA.tenantId, organizationId: tenantA.organization.id },
        headers: { ...defaultHeaders, Cookie: tenantB.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });

    it('should reject GET organization in another tenant with 403', async () => {
      const { error, response } = await call(getOrganization, {
        path: { tenantId: tenantA.tenantId, id: tenantA.organization.id },
        headers: { ...defaultHeaders, Cookie: tenantB.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });
  });

  describe('Users can access their own tenant', () => {
    it('should allow User A to GET attachments in Tenant A', async () => {
      const { response } = await call(getAttachments, {
        path: { tenantId: tenantA.tenantId, organizationId: tenantA.organization.id },
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      expect(response.status).toBe(200);
    });

    it('should allow User B to GET attachments in Tenant B', async () => {
      const { response } = await call(getAttachments, {
        path: { tenantId: tenantB.tenantId, organizationId: tenantB.organization.id },
        headers: { ...defaultHeaders, Cookie: tenantB.sessionCookie },
      });
      expect(response.status).toBe(200);
    });
  });

  // ---- Write isolation: cross-tenant write attempts ----

  describe('Cross-tenant write denial', () => {
    it('should reject User A creating attachment in Tenant B with 403', async () => {
      const { error, response } = await call(createAttachments, {
        path: { tenantId: tenantB.tenantId, organizationId: tenantB.organization.id },
        body: [attachmentBody('00000000-0000-4000-a000-000000000001')],
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });

    it('should reject User A updating Tenant B organization with 403', async () => {
      const { error, response } = await call(updateOrganization, {
        path: { tenantId: tenantB.tenantId, id: tenantB.organization.id },
        body: { name: 'Hijacked by A' },
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });

    it('should reject User B creating attachment in Tenant A with 403', async () => {
      const { error, response } = await call(createAttachments, {
        path: { tenantId: tenantA.tenantId, organizationId: tenantA.organization.id },
        body: [attachmentBody('00000000-0000-4000-a000-000000000002')],
        headers: { ...defaultHeaders, Cookie: tenantB.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });

    it('should reject User B updating Tenant A organization with 403', async () => {
      const { error, response } = await call(updateOrganization, {
        path: { tenantId: tenantA.tenantId, id: tenantA.organization.id },
        body: { name: 'Hijacked by B' },
        headers: { ...defaultHeaders, Cookie: tenantB.sessionCookie },
      });
      expect(response.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('forbidden');
    });
  });
});
