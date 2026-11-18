import { eq } from 'drizzle-orm';
import {
  batchDeleteMembers,
  checkMemberInvite,
  getUser,
  inviteMembers,
  listInvitations,
  listMembers,
  listOrganizations,
  listUsers,
  updateMembership,
} from 'sdk';
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
/** Who asks: `viewer` reads, `manager` (an organization admin with the same read of people) invites and manages members. */
type Askers = { viewer: Session; manager: Session };

const httpMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Every operation that names a person by id (a `userId` or `memberUserId` parameter) and is not for system admins alone. */
const operationsNamingAPerson = async () => {
  const { baseApp } = await import('#/routes');
  const { paths = {} } = baseApp.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'people', version: '0' } });
  return Object.values(paths).flatMap((item) =>
    httpMethods.flatMap((method) => {
      const operation = item[method];
      if (!operation || ((operation['x-guard'] as string[] | undefined) ?? []).includes('sysAdminGuard')) return [];
      const parameters = (operation.parameters ?? []).flatMap((parameter) => ('name' in parameter ? [parameter.name] : []));
      return parameters.includes('userId') || parameters.includes('memberUserId') ? [String(operation.operationId)] : [];
    }),
  );
};

/**
 * Whom a member sees is decided by their role's read of people, on every route that names a person: an organization
 * member whose role reads no one must not find another member through any of them, and gets the answer an outsider gets.
 */
describe('who sees whom', async () => {
  const call = await createAppClient();
  const db = getSeedDb();
  let org: { id: string; tenantId: string };
  let target: Session;
  let created = 0;

  beforeAll(async () => {
    org = await createTestOrganization();
    target = await createOrgUser(call, org.tenantId, org.id, 'visibility-target', memberRole);
  });

  afterAll(async () => await clearSecurityTestData());

  const headersOf = (asker: Session) => ({ ...defaultHeaders, Cookie: asker.sessionCookie });
  const orgPath = () => ({ tenantId: org.tenantId, organizationId: org.id });
  const channel = () => ({ channelId: org.id, channelType: 'organization' as const });
  /** A member of its own for a surface that changes or removes one. */
  const newMember = () => createOrgUser(call, org.tenantId, org.id, `visibility-member-${++created}`, memberRole);

  /** One answer for an unseen person, missing and unrelated alike. */
  const refused = async (answer: Parameters<typeof expectRefusal>[0], label: string) => {
    await expectRefusal(answer, 403, 'forbidden', label);
    return false;
  };

  /** Each surface, by operation, answers whether the asker finds or reaches the person there. */
  const surfaces: Record<string, (askers: Askers) => Promise<boolean>> = {
    listUsers: async ({ viewer }) => {
      const { data } = await call(listUsers, { query: {}, headers: headersOf(viewer) });
      return (data as Listed).results.some(({ id }) => id === target.id);
    },
    'listUsers search': async ({ viewer }) => {
      const { data } = await call(listUsers, { query: { q: 'visibility-target' }, headers: headersOf(viewer) });
      return (data as Listed).results.some(({ id }) => id === target.id);
    },
    getUser: async ({ viewer }) => {
      const answer = await call(getUser, { path: { userId: target.id }, headers: headersOf(viewer) });
      return answer.response.status === 200 || refused(answer, 'getUser');
    },
    listOrganizations: async ({ viewer }) => {
      const answer = await call(listOrganizations, { query: { memberUserId: target.id }, headers: headersOf(viewer) });
      return answer.response.status === 200 || refused(answer, 'listOrganizations');
    },
    listMembers: async ({ viewer }) => {
      const answer = await call(listMembers, { path: orgPath(), query: channel(), headers: headersOf(viewer) });
      if (answer.response.status !== 200) return refused(answer, 'listMembers');
      return (answer.data as Listed).results.some(({ id }) => id === target.id);
    },
    listInvitations: async ({ viewer }) => {
      const answer = await call(listInvitations, { path: orgPath(), query: channel(), headers: headersOf(viewer) });
      return answer.response.status === 200 || refused(answer, 'listInvitations');
    },
    checkMemberInvite: async ({ manager }) => {
      const body = { emails: [`visibility-invitee-${++created}@security-test.com`] };
      const answer = await call(checkMemberInvite, { path: orgPath(), query: channel(), body, headers: headersOf(manager) });
      return answer.response.status === 200 || refused(answer, 'checkMemberInvite');
    },
    inviteMembers: async ({ manager }) => {
      const body = { emails: [`visibility-invitee-${++created}@security-test.com`], role: memberRole };
      const answer = await call(inviteMembers, { path: orgPath(), query: channel(), body, headers: headersOf(manager) });
      return answer.response.status === 200 || refused(answer, 'inviteMembers');
    },
    batchDeleteMembers: async ({ manager }) => {
      const member = await newMember();
      const body = { ids: [member.id] };
      const answer = await call(batchDeleteMembers, { path: orgPath(), query: channel(), body, headers: headersOf(manager) });
      if (answer.response.status !== 200) return refused(answer, 'batchDeleteMembers');
      return !(answer.data as { rejectedIds: string[] }).rejectedIds.includes(member.id);
    },
    updateMembership: async ({ manager }) => {
      const member = await newMember();
      const [membership] = await db.select({ id: membershipsTable.id }).from(membershipsTable).where(eq(membershipsTable.userId, member.id));
      const path = { ...orgPath(), membershipId: membership?.id ?? '' };
      const answer = await call(updateMembership, { path, body: { role: adminRole }, headers: headersOf(manager) });
      return answer.response.status === 200 || refused(answer, 'updateMembership');
    },
  };

  it('covers every operation that names a person: a new one is examined here before it ships', async () => {
    const naming = await operationsNamingAPerson();
    // The reader finds the known ones, so an empty list cannot pass for full coverage.
    expect(naming).toEqual(expect.arrayContaining(['getUser', 'listOrganizations']));
    expect(Object.keys(surfaces)).toEqual(expect.arrayContaining(naming));
  });

  describe.each([
    { label: 'a member whose role reads people', read: 1 as const, sees: true },
    { label: 'a member whose role reads no one', read: 0 as const, sees: false },
  ])('$label', ({ read, sees }) => {
    assumePeopleRead(memberRole, read);
    assumePeopleRead(adminRole, read);
    let askers: Askers;

    beforeAll(async () => {
      askers = {
        viewer: await createOrgUser(call, org.tenantId, org.id, `visibility-viewer-${read}`, memberRole),
        manager: await createOrgUser(call, org.tenantId, org.id, `visibility-manager-${read}`, adminRole),
      };
    });

    it.each(Object.keys(surfaces))(`%s: ${sees ? 'finds' : 'never finds'} another member`, async (surface) => {
      expect(await surfaces[surface]?.(askers)).toBe(sees);
    });

    it('always finds themself', async () => {
      const { viewer } = askers;
      const { data } = await call(listUsers, { query: {}, headers: headersOf(viewer) });
      expect((data as Listed).results.map(({ id }) => id)).toContain(viewer.id);
      expect((await call(getUser, { path: { userId: viewer.id }, headers: headersOf(viewer) })).response.status).toBe(200);
    });
  });

  describe('a system admin with no membership', () => {
    assumePeopleRead(memberRole, 0);
    assumePeopleRead(adminRole, 0);
    let askers: Askers;

    beforeAll(async () => {
      const admin = await createSystemAdminUser('visibility-sysadmin@security-test.com');
      const session = { id: admin.id, sessionCookie: await createTestSession(admin) };
      askers = { viewer: session, manager: session };
    });

    it.each(Object.keys(surfaces))('%s: finds every member', async (surface) => {
      expect(await surfaces[surface]?.(askers)).toBe(true);
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
