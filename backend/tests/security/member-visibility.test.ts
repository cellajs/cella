import { eq } from 'drizzle-orm';
import { checkMemberInvite, getUser, inviteMembers, listInvitations, listMembers, listOrganizations, listUsers } from 'sdk';
import { type ChannelEntityType, type EntityRole, policyMatrix } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getSeedDb } from '#/db/db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { planInvites, toInviteOutcome } from '#/modules/memberships/operations/plan-invites';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import { createSystemAdminUser, createTestOrganization, createTestSession, expectRefusal } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, createOrgUser } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/**
 * While a suite runs, `role` reads the organization's people or not, whatever the app configures: the default, only
 * shared channels or nobody. The app's own matrix comes back afterwards.
 */
const assumePeopleRead = (role: EntityRole, read: 0 | 1) => {
  let configured: typeof policyMatrix.user;
  beforeAll(() => {
    configured = policyMatrix.user;
    const entries = (configured ?? []).filter((entry) => !(entry.channelType === 'organization' && entry.role === role));
    const cells = { create: 0, read, update: 0, delete: 0 } as const;
    policyMatrix.user = [...entries, { channelType: 'organization', role, permissions: cells }];
  });
  afterAll(() => {
    if (configured) policyMatrix.user = configured;
    else delete policyMatrix.user;
  });
};

type Session = { id: string; sessionCookie: string };
type Listed = { results: { id: string }[] };

/**
 * Whom a member sees is decided by their role's read of people, on every route that names a person: an organization
 * member whose role reads no one must not find another member through any of them, and gets the answer an outsider gets.
 */
describe('who sees whom', async () => {
  const call = await createAppClient();
  let org: { id: string; tenantId: string };
  let target: Session;

  beforeAll(async () => {
    org = await createTestOrganization();
    target = await createOrgUser(call, org.tenantId, org.id, 'visibility-target', memberRole);
  });

  afterAll(async () => await clearSecurityTestData());

  const headersOf = (viewer: Session) => ({ ...defaultHeaders, Cookie: viewer.sessionCookie });
  const orgPath = () => ({ tenantId: org.tenantId, organizationId: org.id });
  const channel = () => ({ channelId: org.id, channelType: 'organization' as const });

  /** One answer for an unseen person, missing and unrelated alike. */
  const refused = async (answer: Parameters<typeof expectRefusal>[0], label: string) => {
    await expectRefusal(answer, 403, 'forbidden', label);
    return false;
  };

  /** Each surface answers whether the viewer finds the target there. */
  const surfaces: Record<string, (viewer: Session) => Promise<boolean>> = {
    'list users': async (viewer) => {
      const { data } = await call(listUsers, { query: {}, headers: headersOf(viewer) });
      return (data as Listed).results.some(({ id }) => id === target.id);
    },
    search: async (viewer) => {
      const { data } = await call(listUsers, { query: { q: 'visibility-target' }, headers: headersOf(viewer) });
      return (data as Listed).results.some(({ id }) => id === target.id);
    },
    'get one user': async (viewer) => {
      const answer = await call(getUser, { path: { userId: target.id }, headers: headersOf(viewer) });
      return answer.response.status === 200 || refused(answer, 'get one user');
    },
    'relatable guard': async (viewer) => {
      const answer = await call(listOrganizations, { query: { sharedWithUserId: target.id }, headers: headersOf(viewer) });
      return answer.response.status === 200 || refused(answer, 'relatable guard');
    },
    "the organization's member list": async (viewer) => {
      const answer = await call(listMembers, { path: orgPath(), query: channel(), headers: headersOf(viewer) });
      if (answer.response.status !== 200) return refused(answer, 'member list');
      return (answer.data as Listed).results.some(({ id }) => id === target.id);
    },
    'the invitation list': async (viewer) => {
      const answer = await call(listInvitations, { path: orgPath(), query: channel(), headers: headersOf(viewer) });
      return answer.response.status === 200 || refused(answer, 'invitation list');
    },
  };

  describe.each([
    { label: 'a member whose role reads people', read: 1 as const, sees: true },
    { label: 'a member whose role reads no one', read: 0 as const, sees: false },
  ])('$label', ({ read, sees }) => {
    assumePeopleRead(memberRole, read);
    assumePeopleRead(adminRole, read);
    let viewer: Session;

    beforeAll(async () => {
      viewer = await createOrgUser(call, org.tenantId, org.id, `visibility-viewer-${read}`, memberRole);
    });

    it.each(Object.keys(surfaces))(`%s: ${sees ? 'finds' : 'never finds'} another member`, async (surface) => {
      expect(await surfaces[surface]?.(viewer)).toBe(sees);
    });

    it.runIf(read === 0)('may neither check nor send an invite, even as an admin', async () => {
      const admin = await createOrgUser(call, org.tenantId, org.id, 'visibility-admin-0', adminRole);
      const body = { emails: ['visibility-invitee@security-test.com'] };
      const answers = [
        await call(checkMemberInvite, { path: orgPath(), query: channel(), body, headers: headersOf(admin) }),
        await call(inviteMembers, { path: orgPath(), query: channel(), body: { ...body, role: memberRole }, headers: headersOf(admin) }),
      ];
      for (const answer of answers) await expectRefusal(answer, 403, 'forbidden', 'invite');
    });

    it('always finds themself', async () => {
      const { data } = await call(listUsers, { query: {}, headers: headersOf(viewer) });
      expect((data as Listed).results.map(({ id }) => id)).toContain(viewer.id);
      expect((await call(getUser, { path: { userId: viewer.id }, headers: headersOf(viewer) })).response.status).toBe(200);
    });
  });

  describe('a system admin with no membership', () => {
    assumePeopleRead(memberRole, 0);
    assumePeopleRead(adminRole, 0);
    let viewer: Session;

    beforeAll(async () => {
      const admin = await createSystemAdminUser('visibility-sysadmin@security-test.com');
      viewer = { id: admin.id, sessionCookie: await createTestSession(admin) };
    });

    it.each(Object.keys(surfaces))('%s: finds every member', async (surface) => {
      expect(await surfaces[surface]?.(viewer)).toBe(true);
    });
  });
});

/**
 * An organization member invited below the organization joins at once, which tells the inviter that the address is a
 * member. For a member the inviter does not see, the plan is the one for an account outside the organization.
 */
describe('the invite plan of a member the inviter does not see', async () => {
  const call = await createAppClient();
  const db = getSeedDb();
  let org: { id: string; tenantId: string };
  let inviter: Session & { email: string };
  let member: { email: string };
  let outsider: { email: string };

  beforeAll(async () => {
    org = await createTestOrganization();
    const elsewhere = await createTestOrganization();
    inviter = await createOrgUser(call, org.tenantId, org.id, 'plan-inviter', memberRole);
    member = await createOrgUser(call, org.tenantId, org.id, 'plan-member', memberRole);
    outsider = await createOrgUser(call, elsewhere.tenantId, elsewhere.id, 'plan-outsider', memberRole);
  });

  afterAll(async () => await clearSecurityTestData());

  // Test mock: the template declares no channel below the organization, where a member joins at once. The plan only
  // tells such a channel apart from the organization by its type: a type the app does not declare stands in.
  const belowOrganization = 'below-organization' as ChannelEntityType;

  const plan = async () => {
    const bindings = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, inviter.id));
    const ctx = { var: { db, organizationId: org.id, user: { email: inviter.email }, actor: { id: inviter.id, bindings, scopes: null } } };
    const planned = await planInvites(ctx, {
      emails: [member.email, outsider.email],
      entity: { id: generateId() },
      channelType: belowOrganization,
      held: false,
    });
    return planned.map((item) => ({ ...toInviteOutcome(item), email: undefined, kind: item.outcome, keys: Object.keys(item).sort() }));
  };

  describe('the inviter reads people', () => {
    assumePeopleRead(memberRole, 1);

    it('adds the member at once and invites the outsider', async () => {
      const [forMember, forOutsider] = await plan();
      expect(forMember?.kind).toBe('add');
      expect(forOutsider?.kind).toBe('invite');
    });
  });

  describe('the inviter reads no one', () => {
    assumePeopleRead(memberRole, 0);

    it('answers and plans for the member exactly as for the outsider', async () => {
      const [forMember, forOutsider] = await plan();
      expect(forMember?.kind).toBe('invite');
      expect(forMember).toEqual(forOutsider);
    });
  });
});
