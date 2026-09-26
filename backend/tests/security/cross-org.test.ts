import { createAttachments, deleteAttachments, getAttachments, getOrganization, updateOrganization } from 'sdk';
import { appConfig, hierarchy } from 'shared';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import type { generateMockEntityBodyChannelIdColumns } from '#/mocks';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { defaultHeaders } from '../fixtures';
import type { ErrorResponse } from '../helpers';
import { seedEntityHierarchy } from '../hierarchy-helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createSecondOrg, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

// The create body carries the deepest seeded home id only (the placement seam derives the chain
// above it server-side and the relation columns reference it); empty in cella's org-homed default.
let plan: TestEntityHierarchyPlan | undefined;
type BodyChannelIdColumns = ReturnType<typeof generateMockEntityBodyChannelIdColumns<'attachment'>>;
const bodyChannelIdColumns = (): BodyChannelIdColumns => {
  const deepest = hierarchy
    .getOrderedAncestors('attachment')
    .find((type) => type !== 'organization' && plan?.channelIdColumns[appConfig.entityIdColumnKeys[type]]);
  if (!deepest) return {} as BodyChannelIdColumns;
  const key = appConfig.entityIdColumnKeys[deepest];
  return { [key]: plan?.channelIdColumns[key] } as BodyChannelIdColumns;
};

/** A create body keyed under the organization's upload prefix. */
const attachmentBody = (id: string, organizationId: string) => ({
  id,
  filename: 'cross-org.pdf',
  contentType: 'application/pdf',
  size: '1024',
  keys: { original: `${organizationId}/test/cross-org-${id}.pdf` },
  // Body-level context ids derived from the hierarchy (empty in cella, e.g. { projectId } in apps).
  ...bodyChannelIdColumns(),
  stx: { mutationId: id, sourceId: 'cross-org', fieldTimestamps: {} },
});

/**
 * One tenant holds one organization, so another organization's id is tried on the caller's OWN tenant path: that
 * passes tenantGuard and leaves orgGuard and the handlers' scope check as the barrier. The tenant boundary itself is
 * cross-tenant.test.ts.
 */
describe('Cross-organization API isolation', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let orgB: { id: string; slug: string; tenantId: string };
  let userB: { id: string; email: string; sessionCookie: string };
  /** A member of org A and of org B, whose org B membership must not carry over to tenant A's path. */
  let insider: { id: string; email: string; sessionCookie: string };

  beforeAll(async () => {
    mockFetchRequest();

    tenant = await createTestTenant(call, 'org-isolation');
    plan = buildTestEntityHierarchyPlan({
      entityType: 'attachment',
      organizationId: tenant.organization.id,
      makeChannelId: () => generateId(),
    });
    await seedEntityHierarchy(db, plan, {
      tenantId: tenant.tenantId,
      createdBy: tenant.user.id,
      slugPrefix: 'cross-org',
    });

    const secondOrg = await createSecondOrg();
    orgB = { id: secondOrg.id, slug: secondOrg.slug, tenantId: secondOrg.tenantId };
    userB = await createOrgUser(call, secondOrg.tenantId, orgB.id, 'org-b');

    insider = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'org-both');
    await db.insert(membershipsTable).values({
      id: generateId(),
      userId: insider.id,
      channelId: orgB.id,
      organizationId: orgB.id,
      tenantId: orgB.tenantId,
      channelType: 'organization',
      role: hierarchy.getLeastPrivilegedRole('organization'),
      displayOrder: 2,
      createdBy: insider.id,
    });
  });

  afterAll(async () => {
    await clearSecurityTestData();
  });

  /** Org B's id on the given tenant path: a list, a create and an organization update, as the caller sees them. */
  const reachOrgB = async (tenantId: string, cookie: string) => {
    const headers = { ...defaultHeaders, Cookie: cookie };
    const answers = await Promise.all([
      call(getAttachments, { path: { tenantId, organizationId: orgB.id }, headers }),
      call(createAttachments, {
        path: { tenantId, organizationId: orgB.id },
        body: [attachmentBody(generateId(), orgB.id)],
        headers,
      }),
      call(updateOrganization, { path: { tenantId, id: orgB.id }, body: { name: 'Hijacked' }, headers }),
    ]);
    return answers.map(({ response, error }) => ({
      status: response.status,
      type: (error as ErrorResponse | undefined)?.type,
    }));
  };

  describe("Org B's id on tenant A's path", () => {
    it('must not reach org B via the tenant A path of a user who is in org A only', async () => {
      for (const answer of await reachOrgB(tenant.tenantId, tenant.sessionCookie)) {
        expect(answer).toEqual({ status: 404, type: 'not_found' });
      }
    });

    it('must not reach org B via the tenant A path of a member of both organizations', async () => {
      // The organization is resolved inside the URL's tenant: a membership in org B does not carry it over.
      for (const answer of await reachOrgB(tenant.tenantId, insider.sessionCookie)) {
        expect(answer).toEqual({ status: 404, type: 'not_found' });
      }

      // Positive control: the same member reaches each organization on its own tenant's path.
      const headers = { ...defaultHeaders, Cookie: insider.sessionCookie };
      for (const path of [
        { tenantId: orgB.tenantId, organizationId: orgB.id },
        { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
      ]) {
        expect((await call(getAttachments, { path, headers })).response.status).toBe(200);
      }
    });
  });

  describe('Users can access their own organization', () => {
    it('should allow User B to GET attachments in org B', async () => {
      const { response } = await call(getAttachments, {
        path: { tenantId: orgB.tenantId, organizationId: orgB.id },
        headers: { ...defaultHeaders, Cookie: userB.sessionCookie },
      });
      expect(response.status).toBe(200);
    });

    it('should allow User A to GET their own organization', async () => {
      const { response } = await call(getOrganization, {
        path: { tenantId: tenant.tenantId, id: tenant.organization.id },
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(response.status).toBe(200);
    });

    it('should allow User A to update their own organization', async () => {
      const { response } = await call(updateOrganization, {
        path: { tenantId: tenant.tenantId, id: tenant.organization.id },
        body: { name: 'Org A Updated' },
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(response.status).toBe(200);
    });

    it('should allow User A to soft-delete their own attachment', async () => {
      const id = '00000000-0000-4000-a000-00000000d001';

      const createRes = await call(createAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        body: [attachmentBody(id, tenant.organization.id)],
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });
      expect(createRes.response.status).toBe(201);

      const { response } = await call(deleteAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        body: { ids: [id], stx: { mutationId: `${id}-delete`, sourceId: 'cross-org' } },
        headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
      });

      expect(response.status).toBe(200);
    });
  });
});
