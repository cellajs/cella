import { and, eq } from 'drizzle-orm';
import {
  batchCreateAttachments,
  batchDeleteAttachments,
  batchDeleteMembers,
  batchDeleteOrganizations,
  getAttachment,
  getOrganization,
  getUser,
  inviteMembers,
  listAttachments,
  listInvitations,
  listMembers,
  listUsers,
  resendInvitation,
  updateAttachment,
  updateMembership,
  updateOrganization,
} from 'sdk';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { assumeMemberAttachmentPolicy } from 'shared/testing/member-policy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { invitationsTable } from '#/modules/memberships/invitations-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { mockStxFor } from '#/schemas/sync-transaction-mocks';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import { adminDb, expectRefusal, insertOrgMembership } from '../helpers';
import { attachmentBody, joinAttachmentHome, seedAttachmentHome } from '../hierarchy-helpers';
import { createInvitation } from '../invitations/helpers';
import { createAppClient, type TestResult } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser, createSecondOrg, createTestTenant, type TestTenant } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const renameStx = () => mockStxFor('name');

type Session = { sessionCookie: string };
const notFound = { status: 404, type: 'not_found' };
const forbidden = { status: 403, type: 'forbidden' };

interface Row {
  route: string;
  attempt: (as: Session) => Promise<TestResult>;
  /** The one answer for a foreign id, the same as for an id that names nothing. */
  refusal?: { status: number; type: string };
  /** What the attempts must have left as it was. */
  unchanged?: () => Promise<void>;
}

/**
 * One tenant holds one organization, so another organization's id is tried on the caller's OWN tenant path: that
 * passes tenantGuard and leaves orgGuard and the handlers' scope check as the barrier. Organizations and memberships
 * sit outside RLS, so that check is their only one. The tenant boundary itself is cross-tenant.test.ts.
 */
describe('Cross-organization API isolation', async () => {
  assumeMemberAttachmentPolicy({ read: 1, update: 'own', delete: 'own' });
  const call = await createAppClient();
  let tenant: TestTenant;
  let plan: TestEntityHierarchyPlan;
  let orgB: { id: string; name: string; tenantId: string };
  let planB: TestEntityHierarchyPlan;
  let userB: { id: string; email: string; sessionCookie: string };
  /** A member of org A and an admin of org B, whose org B role must not carry over to tenant A's path. */
  let insider: { id: string; email: string; sessionCookie: string };
  /** Org B's attachment, its admin's membership row and a pending invitation: the ids tried on tenant A's path. */
  let attachmentB: { id: string; name: string | null };
  let membershipB: { id: string };
  let invitationB: { id: string };
  const invitedByAttacker = 'cross-org-newcomer@security-test.com';

  const headers = (as: Session) => ({ ...defaultHeaders, Cookie: as.sessionCookie });
  const attachmentRow = async (id: string) => (await adminDb.select().from(attachmentsTable).where(eq(attachmentsTable.id, id)))[0];
  const organizationRow = async (id: string) => (await db.select().from(organizationsTable).where(eq(organizationsTable.id, id)))[0];
  const tenantStatus = async (id: string) =>
    (await db.select({ status: tenantsTable.status }).from(tenantsTable).where(eq(tenantsTable.id, id)))[0]?.status;
  const membershipRow = async (id: string) => (await db.select().from(membershipsTable).where(eq(membershipsTable.id, id)))[0];

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'org-isolation');
    plan = await seedAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, tenant.user.id);

    const secondOrg = await createSecondOrg();
    orgB = { id: secondOrg.id, name: secondOrg.name, tenantId: secondOrg.tenantId };
    userB = await createOrgUser(call, orgB.tenantId, orgB.id, 'org-b', adminRole);
    planB = await seedAttachmentHome(orgB, userB.id);

    insider = await createOrgUser(call, tenant.tenantId, tenant.organization.id, 'org-both', memberRole);
    await joinAttachmentHome({ id: tenant.organization.id, tenantId: tenant.tenantId }, plan, insider.id);
    await insertOrgMembership(insider.id, orgB, { role: adminRole, displayOrder: 2 });

    const attachmentId = generateId();
    const created = await call(batchCreateAttachments, {
      path: { tenantId: orgB.tenantId, organizationId: orgB.id },
      body: [attachmentBody(attachmentId, planB)],
      headers: headers(userB),
    });
    expect(created.response.status).toBe(201);
    attachmentB = { id: attachmentId, name: (await attachmentRow(attachmentId)).name };
    [membershipB] = await db
      .select({ id: membershipsTable.id })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, userB.id), eq(membershipsTable.channelId, orgB.id)));
    invitationB = (await createInvitation({ organization: orgB, email: 'cross-org-invitee@security-test.com', createdBy: userB.id }))
      .inactiveMembership;
  });

  afterAll(async () => {
    await clearSecurityTestData();
  });

  /** Org B's ids on tenant A's path, on every route that takes one. */
  const rows: Row[] = [
    {
      route: 'listAttachments',
      attempt: (as) => call(listAttachments, { path: { tenantId: tenant.tenantId, organizationId: orgB.id }, headers: headers(as) }),
    },
    {
      route: 'batchCreateAttachments',
      attempt: (as) =>
        call(batchCreateAttachments, {
          path: { tenantId: tenant.tenantId, organizationId: orgB.id },
          body: [attachmentBody(generateId(), planB)],
          headers: headers(as),
        }),
    },
    {
      route: 'getOrganization',
      attempt: (as) => call(getOrganization, { path: { tenantId: tenant.tenantId, organizationId: orgB.id }, headers: headers(as) }),
    },
    {
      route: 'updateOrganization',
      attempt: (as) =>
        call(updateOrganization, { path: { tenantId: tenant.tenantId, organizationId: orgB.id }, body: { name: 'Hijacked' }, headers: headers(as) }),
      unchanged: async () => expect((await organizationRow(orgB.id)).name).toBe(orgB.name),
    },
    {
      route: 'batchDeleteOrganizations',
      attempt: (as) => call(batchDeleteOrganizations, { path: { tenantId: tenant.tenantId }, body: { ids: [orgB.id] }, headers: headers(as) }),
      refusal: forbidden,
      // The row stays either way, since a delete marks the tenant deleted: the tenant must still be active.
      unchanged: async () => expect(await tenantStatus(orgB.tenantId)).toBe('active'),
    },
    {
      route: 'getAttachment',
      attempt: (as) =>
        call(getAttachment, {
          path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id, attachmentId: attachmentB.id },
          headers: headers(as),
        }),
    },
    {
      route: 'updateAttachment',
      attempt: (as) =>
        call(updateAttachment, {
          path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id, attachmentId: attachmentB.id },
          body: { ops: { name: 'Hijacked' }, stx: renameStx() },
          headers: headers(as),
        }),
      unchanged: async () => expect((await attachmentRow(attachmentB.id)).name).toBe(attachmentB.name),
    },
    {
      route: 'batchDeleteAttachments',
      attempt: (as) =>
        call(batchDeleteAttachments, {
          path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
          body: { ids: [attachmentB.id], stx: { mutationId: generateId(), sourceId: 'cross-org' } },
          headers: headers(as),
        }),
      refusal: forbidden,
      unchanged: async () => expect((await attachmentRow(attachmentB.id)).deletedAt).toBeNull(),
    },
    {
      route: 'listMembers',
      attempt: (as) =>
        call(listMembers, {
          path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
          query: { entityId: orgB.id, entityType: 'organization' },
          headers: headers(as),
        }),
    },
    {
      route: 'listInvitations',
      attempt: (as) =>
        call(listInvitations, {
          path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
          query: { entityId: orgB.id, entityType: 'organization' },
          headers: headers(as),
        }),
    },
    {
      route: 'updateMembership',
      attempt: (as) =>
        call(updateMembership, {
          path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id, membershipId: membershipB.id },
          body: { role: memberRole } as never,
          headers: headers(as),
        }),
      unchanged: async () => expect((await membershipRow(membershipB.id)).role).toBe(adminRole),
    },
    {
      route: 'batchDeleteMembers',
      attempt: (as) =>
        call(batchDeleteMembers, {
          path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
          query: { entityId: orgB.id, entityType: 'organization' },
          body: { ids: [userB.id] },
          headers: headers(as),
        }),
      unchanged: async () => expect(await membershipRow(membershipB.id)).toBeDefined(),
    },
    {
      route: 'inviteMembers',
      attempt: (as) =>
        call(inviteMembers, {
          path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
          query: { entityId: orgB.id, entityType: 'organization' },
          body: { emails: [invitedByAttacker], role: memberRole },
          headers: headers(as),
        }),
      unchanged: async () => expect(await db.select().from(invitationsTable).where(eq(invitationsTable.email, invitedByAttacker))).toHaveLength(0),
    },
    {
      route: 'resendInvitation',
      attempt: (as) =>
        call(resendInvitation, {
          path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id, invitationId: invitationB.id },
          headers: headers(as),
        }),
      unchanged: async () => expect(mailer.sendEmails).not.toHaveBeenCalled(),
    },
  ];

  it.each(rows)("must not reach org B via $route on tenant A's path", async ({ attempt, refusal = notFound, unchanged }) => {
    // The organization is resolved inside the URL's tenant: a role in org B does not carry it over either.
    for (const attacker of [tenant, insider]) await expectRefusal(await attempt(attacker), refusal.status, refusal.type);
    await unchanged?.();
  });

  it("must not delete org B's attachment via a batch on tenant A's path that also names the caller's own", async () => {
    for (const attacker of [tenant, insider]) {
      const own = generateId();
      const created = await call(batchCreateAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        body: [attachmentBody(own, plan)],
        headers: headers(attacker),
      });
      expect(created.response.status).toBe(201);

      const { data, response } = await call(batchDeleteAttachments, {
        path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
        body: { ids: [own, attachmentB.id], stx: { mutationId: generateId(), sourceId: 'cross-org' } },
        headers: headers(attacker),
      });
      expect(response.status).toBe(200);
      expect((data as { rejectedIds: string[] }).rejectedIds).toEqual([attachmentB.id]);
      expect((await attachmentRow(own)).deletedAt).not.toBeNull();
      expect((await attachmentRow(attachmentB.id)).deletedAt).toBeNull();
    }
  });

  it('must not reach a user outside a shared organization via getUser or listUsers', async () => {
    const one = await call(getUser, { path: { userId: userB.id }, headers: headers(tenant) });
    await expectRefusal(one, 403, 'forbidden');
    const listedFor = async (as: Session) => {
      const { data, response } = await call(listUsers, { headers: headers(as) });
      expect(response.status).toBe(200);
      return (data as { results: { id: string }[] }).results.map((user) => user.id);
    };
    expect(await listedFor(tenant)).not.toContain(userB.id);

    // Positive control: the member of both organizations shares one with user B.
    expect((await call(getUser, { path: { userId: userB.id }, headers: headers(insider) })).response.status).toBe(200);
    expect(await listedFor(insider)).toContain(userB.id);
  });

  it("must not serve org B's attachment on tenant A's path from a cache its own path warmed", async () => {
    // The member of both organizations reads it on its own path, which caches it.
    const own = await call(getAttachment, {
      path: { tenantId: orgB.tenantId, organizationId: orgB.id, attachmentId: attachmentB.id },
      headers: headers(insider),
    });
    expect(own.response.status).toBe(200);

    const { response, error } = await call(getAttachment, {
      path: { tenantId: tenant.tenantId, organizationId: tenant.organization.id, attachmentId: attachmentB.id },
      headers: headers(insider),
    });
    await expectRefusal({ response, error }, 404, 'not_found');
  });

  it('reaches each organization on its own tenant path (positive control)', async () => {
    for (const path of [
      { tenantId: orgB.tenantId, organizationId: orgB.id },
      { tenantId: tenant.tenantId, organizationId: tenant.organization.id },
    ]) {
      expect((await call(listAttachments, { path, headers: headers(insider) })).response.status).toBe(200);
    }
    const { response } = await call(getOrganization, { path: { tenantId: orgB.tenantId, organizationId: orgB.id }, headers: headers(userB) });
    expect(response.status).toBe(200);
  });
});
