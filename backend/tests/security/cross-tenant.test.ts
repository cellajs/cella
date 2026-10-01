import { createAttachments, type GetPresignedUrlsResponse, getAttachments, getOrganization, getPresignedUrls, updateOrganization } from 'sdk';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultHeaders } from '../fixtures';
import { expectRefusal } from '../helpers';
import { attachmentBody, seedAttachmentHome } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

// Verifies tenant guard isolation for authenticated users across tenants.
describe('Cross-tenant API isolation', async () => {
  const call = await createAppClient();
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let homeA: TestEntityHierarchyPlan;
  let homeB: TestEntityHierarchyPlan;

  beforeAll(async () => {
    tenantA = await createTestTenant(call, 'tenant-a');
    tenantB = await createTestTenant(call, 'tenant-b');
    homeA = await seedAttachmentHome({ id: tenantA.organization.id, tenantId: tenantA.tenantId }, tenantA.user.id);
    homeB = await seedAttachmentHome({ id: tenantB.organization.id, tenantId: tenantB.tenantId }, tenantB.user.id);
  });

  afterAll(async () => {
    await clearSecurityTestData();
  });

  describe('User A cannot access Tenant B resources', () => {
    it("must not list Tenant B's attachments via User A's session", async () => {
      const { error, response } = await call(getAttachments, {
        path: { tenantId: tenantB.tenantId, organizationId: tenantB.organization.id },
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      await expectRefusal({ response, error }, 403, 'forbidden');
    });

    it("must not read Tenant B's organization via User A's session", async () => {
      const { error, response } = await call(getOrganization, {
        path: { tenantId: tenantB.tenantId, id: tenantB.organization.id },
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      await expectRefusal({ response, error }, 403, 'forbidden');
    });
  });

  describe('User B cannot access Tenant A resources', () => {
    it("must not list Tenant A's attachments via User B's session", async () => {
      const { error, response } = await call(getAttachments, {
        path: { tenantId: tenantA.tenantId, organizationId: tenantA.organization.id },
        headers: { ...defaultHeaders, Cookie: tenantB.sessionCookie },
      });
      await expectRefusal({ response, error }, 403, 'forbidden');
    });

    it("must not read Tenant A's organization via User B's session", async () => {
      const { error, response } = await call(getOrganization, {
        path: { tenantId: tenantA.tenantId, id: tenantA.organization.id },
        headers: { ...defaultHeaders, Cookie: tenantB.sessionCookie },
      });
      await expectRefusal({ response, error }, 403, 'forbidden');
    });
  });

  describe('Users can access their own tenant', () => {
    it("lists Tenant A's attachments for User A (positive control)", async () => {
      const { response } = await call(getAttachments, {
        path: { tenantId: tenantA.tenantId, organizationId: tenantA.organization.id },
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      expect(response.status).toBe(200);
    });

    it("lists Tenant B's attachments for User B (positive control)", async () => {
      const { response } = await call(getAttachments, {
        path: { tenantId: tenantB.tenantId, organizationId: tenantB.organization.id },
        headers: { ...defaultHeaders, Cookie: tenantB.sessionCookie },
      });
      expect(response.status).toBe(200);
    });
  });

  // ---- Write isolation: cross-tenant write attempts ----

  describe('Cross-tenant write denial', () => {
    it("must not create an attachment in Tenant B via User A's session", async () => {
      const { error, response } = await call(createAttachments, {
        path: { tenantId: tenantB.tenantId, organizationId: tenantB.organization.id },
        body: [attachmentBody('00000000-0000-4000-a000-000000000001', homeB)],
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      await expectRefusal({ response, error }, 403, 'forbidden');
    });

    it("must not rename Tenant B's organization via User A's session", async () => {
      const { error, response } = await call(updateOrganization, {
        path: { tenantId: tenantB.tenantId, id: tenantB.organization.id },
        body: { name: 'Hijacked by A' },
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      await expectRefusal({ response, error }, 403, 'forbidden');
    });

    it("must not create an attachment in Tenant A via User B's session", async () => {
      const { error, response } = await call(createAttachments, {
        path: { tenantId: tenantA.tenantId, organizationId: tenantA.organization.id },
        body: [attachmentBody('00000000-0000-4000-a000-000000000002', homeA)],
        headers: { ...defaultHeaders, Cookie: tenantB.sessionCookie },
      });
      await expectRefusal({ response, error }, 403, 'forbidden');
    });

    it("must not rename Tenant A's organization via User B's session", async () => {
      const { error, response } = await call(updateOrganization, {
        path: { tenantId: tenantA.tenantId, id: tenantA.organization.id },
        body: { name: 'Hijacked by B' },
        headers: { ...defaultHeaders, Cookie: tenantB.sessionCookie },
      });
      await expectRefusal({ response, error }, 403, 'forbidden');
    });
  });

  // ---- Tenant A's attachment: never listed for, nor signed for, Tenant B ----

  describe("Cross-tenant reads of Tenant A's attachment", () => {
    const presignAttachmentId = '00000000-0000-4000-a000-0000000000a1';
    let storedKey: string;

    beforeAll(async () => {
      const body = attachmentBody(presignAttachmentId, homeA);
      storedKey = body.keys.original;
      const { response } = await call(createAttachments, {
        path: { tenantId: tenantA.tenantId, organizationId: tenantA.organization.id },
        body: [body],
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      expect(response.status).toBe(201);
    });

    it("must not list Tenant A's attachment via User B's own tenant path", async () => {
      const listedIds = async (tenant: TestTenant) => {
        const { data, response } = await call(getAttachments, {
          path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
          headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
        });
        expect(response.status).toBe(200);
        return (data as { items: { id: string }[] }).items.map((item) => item.id);
      };
      expect(await listedIds(tenantB)).not.toContain(presignAttachmentId);
      // The owning tenant's list carries it (positive control).
      expect(await listedIds(tenantA)).toContain(presignAttachmentId);
    });

    it("signs Tenant A's attachment for User A (positive control)", async () => {
      const { data, response } = await call(getPresignedUrls, {
        path: { tenantId: tenantA.tenantId, organizationId: tenantA.organization.id },
        body: { items: [{ attachmentId: presignAttachmentId, variant: 'original' }] },
        headers: { ...defaultHeaders, Cookie: tenantA.sessionCookie },
      });
      expect(response.status).toBe(200);
      const result = data as GetPresignedUrlsResponse;
      expect(result.rejectedIds).toEqual([]);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.url).toContain(storedKey);
    });

    it("must not sign Tenant A's attachment via User B's session on Tenant A's path", async () => {
      const { error, response } = await call(getPresignedUrls, {
        path: { tenantId: tenantA.tenantId, organizationId: tenantA.organization.id },
        body: { items: [{ attachmentId: presignAttachmentId, variant: 'original' }] },
        headers: { ...defaultHeaders, Cookie: tenantB.sessionCookie },
      });
      await expectRefusal({ response, error }, 403, 'forbidden');
    });

    it("must not sign Tenant A's attachment via its id on User B's own tenant path", async () => {
      const { data, response } = await call(getPresignedUrls, {
        path: { tenantId: tenantB.tenantId, organizationId: tenantB.organization.id },
        body: { items: [{ attachmentId: presignAttachmentId, variant: 'original' }] },
        headers: { ...defaultHeaders, Cookie: tenantB.sessionCookie },
      });
      // A foreign id is indistinguishable from a nonexistent one: 200 + rejectedIds, no oracle.
      expect(response.status).toBe(200);
      const result = data as GetPresignedUrlsResponse;
      expect(result.data).toEqual([]);
      expect(result.rejectedIds).toEqual([presignAttachmentId]);
    });
  });
});
