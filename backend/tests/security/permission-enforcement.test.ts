import {
  createAttachments,
  type GetPresignedUrlsResponse,
  getAttachments,
  getOrganization,
  getPresignedUrls,
  updateOrganization,
} from 'sdk';
import { appConfig, getEntityPolicies, getPolicyPermissions, hierarchy, policyMatrix } from 'shared';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import type { generateMockEntityBodyChannelIdColumns } from '#/mocks';
import { defaultHeaders } from '../fixtures';
import type { ErrorResponse } from '../helpers';
import { seedEntityHierarchy } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

// The body's placement ids must resolve to seeded ancestor rows: the placement seam resolves the
// home channel server-side and the relation columns reference it (empty in cella).
let plan: TestEntityHierarchyPlan | undefined;
type BodyChannelIdColumns = ReturnType<typeof generateMockEntityBodyChannelIdColumns<'attachment'>>;
const bodyChannelIdColumns = (): BodyChannelIdColumns =>
  Object.fromEntries(
    Object.entries(plan?.channelIdColumns ?? {}).filter(
      ([key]) => key !== appConfig.entityIdColumnKeys[hierarchy.rootChannelType],
    ),
  ) as BodyChannelIdColumns;

// Verifies role-based organization permissions and unauthenticated rejection via HTTP.
describe('Permission enforcement via HTTP', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let member: { id: string; email: string; sessionCookie: string };

  beforeAll(async () => {
    mockFetchRequest();

    tenant = await createTestTenant(call, 'perm-test');
    plan = buildTestEntityHierarchyPlan({
      entityType: 'attachment',
      rootChannelId: tenant.organization.id,
      makeChannelId: () => generateId(),
    });
    await seedEntityHierarchy(db, plan, {
      tenantId: tenant.tenantId,
      createdBy: tenant.user.id,
      slugPrefix: 'perm-test',
    });
    member = await createOrgUser(
      call,
      tenant.tenantId,
      tenant.organization.id,
      'perm-member',
      hierarchy.getLeastPrivilegedRole(hierarchy.rootChannelType),
    );
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

  // The member/admin split follows the configured policy matrix, so this suite holds across apps.
  describe('Presigned URLs by role', () => {
    const presignAttachmentId = '00000000-0000-4000-a000-0000000000b1';

    // Derive the member's expectation from the policy: read cell 1 signs an unowned row; 'own'/0 rejects.
    const { rootChannelType } = hierarchy;
    const memberAttachmentRead = getPolicyPermissions(
      getEntityPolicies('attachment', policyMatrix),
      rootChannelType,
      hierarchy.getLeastPrivilegedRole(rootChannelType),
    )?.read;
    const memberSignsUnowned = memberAttachmentRead === 1;

    beforeAll(async () => {
      const { response } = await call(createAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        body: [
          {
            id: presignAttachmentId,
            filename: 'perm-test.pdf',
            contentType: 'application/pdf',
            size: '1024',
            keys: { original: `test/perm-${presignAttachmentId}.pdf` },
            bucketName: 'test-bucket',
            // Body-level context ids derived from the hierarchy (empty in cella, e.g. { projectId } in apps).
            ...bodyChannelIdColumns(),
            stx: { mutationId: presignAttachmentId, sourceId: 'perm-test', fieldTimestamps: {} },
          },
        ],
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(response.status).toBe(201);
    });

    it('should sign for admin', async () => {
      const { data, response } = await call(getPresignedUrls, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        body: { items: [{ attachmentId: presignAttachmentId, variant: 'original' }] },
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(response.status).toBe(200);
      const result = data as GetPresignedUrlsResponse;
      expect(result.data).toHaveLength(1);
      expect(result.rejectedIds).toEqual([]);
    });

    it('signs or rejects a member reading an unowned attachment per the configured read policy', async () => {
      const { data, response } = await call(getPresignedUrls, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        body: { items: [{ attachmentId: presignAttachmentId, variant: 'original' }] },
        headers: { ...defaultHeaders, Cookie: member.sessionCookie },
      });
      expect(response.status).toBe(200);
      const result = data as GetPresignedUrlsResponse;
      if (memberSignsUnowned) {
        expect(result.data).toHaveLength(1);
        expect(result.rejectedIds).toEqual([]);
      } else {
        expect(result.data).toEqual([]);
        expect(result.rejectedIds).toEqual([presignAttachmentId]);
      }
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

    it('should reject unauthenticated presigned URLs with 401', async () => {
      const { response } = await call(getPresignedUrls, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        body: { items: [{ attachmentId: '00000000-0000-4000-a000-0000000000b1', variant: 'original' }] },
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
