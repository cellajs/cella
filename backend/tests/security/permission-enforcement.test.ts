import { and, eq } from 'drizzle-orm';
import {
  createAttachments,
  deleteAttachments,
  deleteMemberships,
  deleteOrganizations,
  membershipInvite,
  resendPendingInvitation,
  updateOrganization,
} from 'sdk';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import { adminDb, createTestOrganization, expectRefusal } from '../helpers';
import { attachmentBody, seedAttachmentHome } from '../hierarchy-helpers';
import { createInvitation } from '../invitations/helpers';
import { createAppClient, type TestResult } from '../test-client';
import { setTestConfig } from '../test-utils';
import { assumeMemberAttachmentPolicy, clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type User = { id: string; email: string; sessionCookie: string };

interface Fixture {
  org: { id: string; tenantId: string; name: string };
  admin: User;
  member: User;
  /** The admin's attachment. */
  attachment: string;
  /** A pending invitation the admin sent. */
  invitation: string;
  /** An attachment `user` created, placed at the attachment's home channel (none in cella). */
  attachmentOf: (user: User) => Promise<string>;
}

interface Row {
  act: string;
  /** The act on `fixture.org` by `actor`, aimed at the other of the two users where it names one. */
  attempt: (fixture: Fixture, actor: User) => Promise<TestResult>;
  /** What a refused attempt must have left as it was. */
  unchanged: (fixture: Fixture) => Promise<void>;
  /** The answer to the admin. */
  okStatus: number;
}

/**
 * A member reads the organization and manages what they created; inviting, removing members, re-sending invitations,
 * the organization's settings and its deletion are the admin's. Each attempt is made on an organization the member
 * reads, so the permission check is what answers, and the same call succeeds for the admin.
 */
describe('Member escalation over HTTP', async () => {
  assumeMemberAttachmentPolicy({ read: 1, update: 'own', delete: 'own' });
  const call = await createAppClient();
  let shared: Fixture;

  const headers = (as: User) => ({ ...defaultHeaders, Cookie: as.sessionCookie });
  const counterpart = ({ admin, member }: Fixture, actor: User) => (actor.id === admin.id ? member : admin);
  const attachmentRow = async (id: string) =>
    (await adminDb.select().from(attachmentsTable).where(eq(attachmentsTable.id, id)))[0];
  const organizationRow = async (id: string) =>
    (await db.select().from(organizationsTable).where(eq(organizationsTable.id, id)))[0];
  const membershipsOf = (userId: string, organizationId: string) =>
    db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.organizationId, organizationId)));
  const invitationsTo = (email: string) =>
    db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.email, email));

  /** An organization with an admin, a member, the admin's attachment and a pending invitation. */
  const fixture = async (label: string): Promise<Fixture> => {
    const org = await createTestOrganization();
    const admin = await createOrgUser(call, org.tenantId, org.id, `${label}-admin`, adminRole);
    const member = await createOrgUser(call, org.tenantId, org.id, `${label}-member`, memberRole);
    const plan = await seedAttachmentHome(org, admin.id);
    const attachmentOf = async (user: User) => {
      const id = generateId();
      const { response } = await call(createAttachments, {
        path: { tenantId: org.tenantId, organizationId: org.id },
        body: [attachmentBody(id, plan)],
        headers: headers(user),
      });
      expect(response.status).toBe(201);
      return id;
    };
    const { inactiveMembership } = await createInvitation({
      organization: org,
      email: `${label}-invitee@security-test.com`,
      createdBy: admin.id,
    });
    return {
      org,
      admin,
      member,
      attachment: await attachmentOf(admin),
      invitation: inactiveMembership.id,
      attachmentOf,
    };
  };

  const rows: Row[] = [
    {
      act: 'update the organization',
      attempt: ({ org }, actor) =>
        call(updateOrganization, {
          path: { tenantId: org.tenantId, id: org.id },
          body: { name: 'Hijacked' },
          headers: headers(actor),
        }),
      unchanged: async ({ org }) => expect((await organizationRow(org.id)).name).toBe(org.name),
      okStatus: 200,
    },
    {
      act: 'invite someone as admin',
      attempt: ({ org }, actor) =>
        call(membershipInvite, {
          path: { tenantId: org.tenantId, organizationId: org.id },
          query: { entityId: org.id, entityType: 'organization' },
          body: { emails: [`newcomer-${actor.id}@security-test.com`], role: adminRole },
          headers: headers(actor),
        }),
      unchanged: async ({ member }) =>
        expect(await invitationsTo(`newcomer-${member.id}@security-test.com`)).toEqual([]),
      okStatus: 200,
    },
    {
      act: 're-send a pending invitation',
      attempt: ({ org, invitation }, actor) =>
        call(resendPendingInvitation, {
          path: { tenantId: org.tenantId, organizationId: org.id, id: invitation },
          headers: headers(actor),
        }),
      unchanged: async () => expect(mailer.prepareEmails).not.toHaveBeenCalled(),
      okStatus: 204,
    },
    {
      act: 'remove another member',
      attempt: (fixture, actor) =>
        call(deleteMemberships, {
          path: { tenantId: fixture.org.tenantId, organizationId: fixture.org.id },
          query: { entityId: fixture.org.id, entityType: 'organization' },
          body: { ids: [counterpart(fixture, actor).id] },
          headers: headers(actor),
        }),
      unchanged: async ({ org, admin }) => expect(await membershipsOf(admin.id, org.id)).toHaveLength(1),
      okStatus: 200,
    },
    {
      act: "delete the admin's attachment",
      attempt: ({ org, attachment }, actor) =>
        call(deleteAttachments, {
          path: { tenantId: org.tenantId, organizationId: org.id },
          body: { ids: [attachment], stx: { mutationId: generateId(), sourceId: 'permission-enforcement' } },
          headers: headers(actor),
        }),
      unchanged: async ({ attachment }) => expect((await attachmentRow(attachment)).deletedAt).toBeNull(),
      okStatus: 200,
    },
    {
      act: 'delete the organization',
      attempt: ({ org }, actor) =>
        call(deleteOrganizations, {
          path: { tenantId: org.tenantId },
          body: { ids: [org.id] },
          headers: headers(actor),
        }),
      unchanged: async ({ org }) => expect(await organizationRow(org.id)).toBeDefined(),
      okStatus: 200,
    },
  ];

  beforeAll(async () => {
    shared = await fixture('escalation');
  });

  afterAll(async () => await clearSecurityTestData());

  it.each(rows)('must not $act via a member session', async ({ attempt, unchanged }) => {
    const { response, error } = await attempt(shared, shared.member);
    await expectRefusal({ response, error }, 403, 'forbidden');
    await unchanged(shared);
  });

  it('lets a member delete their own attachment and an admin do each of the above (positive controls)', async () => {
    const own = await fixture('escalation-control');

    const mine = await own.attachmentOf(own.member);
    const { data, response } = await call(deleteAttachments, {
      path: { tenantId: own.org.tenantId, organizationId: own.org.id },
      body: { ids: [mine], stx: { mutationId: generateId(), sourceId: 'permission-enforcement' } },
      headers: headers(own.member),
    });
    expect(response.status).toBe(200);
    expect((data as { rejectedIds: string[] }).rejectedIds).toEqual([]);
    expect((await attachmentRow(mine)).deletedAt).not.toBeNull();

    // The rows end with the organization's deletion.
    for (const { act, attempt, okStatus } of rows) {
      expect((await attempt(own, own.admin)).response.status, act).toBe(okStatus);
    }
    expect(await organizationRow(own.org.id)).toBeUndefined();
  });
});
