import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createApiKey, createServiceAccount, deleteMemberships, membershipInvite, updateMembership, updateServiceAccount } from 'sdk';
import { type EntityRole, getEntityPolicies, getPolicyPermissions, type OrganizationRole, policyMatrix } from 'shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { apiKeysTable } from '#/modules/service-accounts/api-keys-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import { createSystemAdminUser, createTestOrganization, createTestSession, type ErrorResponse, expectRefusal } from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { createAppClient, type TestResult } from '../test-client';
import { clearSecurityTestData, createFactorOrgUser } from './helpers';

type User = { id: string; email: string; sessionCookie: string };

interface Fixture {
  org: { id: string; tenantId: string };
  admin: User;
  /** A second holder of the top role, the one the acts aim at. */
  otherAdmin: User;
  member: User;
  /** A pending invitation at the member role, sent by the admin. */
  invitee: string;
  /** A service account at the top role with one key, and a disabled one, both the admin's. */
  account: string;
  apiKey: string;
  disabledAccount: string;
}

interface Row {
  act: string;
  attempt: (fixture: Fixture, actor: User) => Promise<TestResult>;
  /** What a refused attempt must have left as it was. */
  unchanged: (fixture: Fixture) => Promise<void>;
  /** The answer to the admin. */
  okStatus: number;
}

/**
 * Roles are declared most to least privileged, and a role grant may not outrank the granter's own. The suite gives the
 * least-privileged organization role `update` and `delete` on the organization, the cell an app sets to let members
 * manage it, so the role rank answers each attempt and not the action check before it.
 */
describe('Role grants above the actor', async () => {
  const call = await createAppClient();
  const memberCell = getPolicyPermissions(getEntityPolicies(policyMatrix, 'organization'), 'organization', memberRole);
  if (!memberCell) throw new Error(`The organization policy has no cell for ${memberRole}`);
  const configured = { ...memberCell };

  beforeAll(() => Object.assign(memberCell, { update: 1, delete: 1 }));
  afterAll(() => Object.assign(memberCell, configured));
  afterEach(async () => await clearSecurityTestData());

  const headers = (as: { sessionCookie: string }) => ({ ...defaultHeaders, Cookie: as.sessionCookie });
  const membershipOf = async (userId: string, organizationId: string) =>
    (
      await db
        .select()
        .from(membershipsTable)
        .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.channelId, organizationId)))
    )[0];
  const invitationsTo = (email: string) => db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.email, email));
  const keysOf = (actorId: string) => db.select().from(apiKeysTable).where(eq(apiKeysTable.actorId, actorId));
  const statusOf = async (id: string) =>
    (await db.select({ status: serviceAccountsTable.status }).from(serviceAccountsTable).where(eq(serviceAccountsTable.id, id)))[0]?.status;

  const serviceAccount = async (org: Fixture['org'], admin: User, role: OrganizationRole) => {
    const { data, response } = await call(createServiceAccount, {
      path: { tenantId: org.tenantId, organizationId: org.id },
      body: { name: `${role} bot`, role, key: { name: 'deploy' } },
      headers: headers(admin),
    });
    expect(response.status).toBe(201);
    return data as { serviceAccount: { id: string }; apiKey: { id: string } };
  };

  const fixture = async (name: string): Promise<Fixture> => {
    const label = `${name}-${nanoid(6)}`;
    const org = await createTestOrganization();
    const admin = await createFactorOrgUser(call, org.tenantId, org.id, `${label}-admin`, adminRole);
    const otherAdmin = await createFactorOrgUser(call, org.tenantId, org.id, `${label}-other-admin`, adminRole);
    const member = await createFactorOrgUser(call, org.tenantId, org.id, `${label}-member`, memberRole);
    const invitee = `${label}-invitee@security-test.com`;
    await createInvitation({ organization: org, email: invitee, createdBy: admin.id });
    const { serviceAccount: account, apiKey } = await serviceAccount(org, admin, adminRole);
    const { serviceAccount: disabled } = await serviceAccount(org, admin, adminRole);
    const path = { tenantId: org.tenantId, organizationId: org.id, id: disabled.id };
    expect((await call(updateServiceAccount, { path, body: { status: 'disabled' }, headers: headers(admin) })).response.status).toBe(200);
    return { org, admin, otherAdmin, member, invitee, account: account.id, apiKey: apiKey.id, disabledAccount: disabled.id };
  };

  const invite = ({ org }: Fixture, actor: User, email: string, role: EntityRole) =>
    call(membershipInvite, {
      path: { tenantId: org.tenantId, organizationId: org.id },
      query: { entityId: org.id, entityType: 'organization' },
      body: { emails: [email], role },
      headers: headers(actor),
    });
  const setRole = async ({ org }: Fixture, actor: User, target: User, role: EntityRole) =>
    call(updateMembership, {
      path: { tenantId: org.tenantId, organizationId: org.id, id: (await membershipOf(target.id, org.id)).id },
      body: { role },
      headers: headers(actor),
    });
  const accountPath = ({ org }: Fixture, id: string) => ({ tenantId: org.tenantId, organizationId: org.id, id });

  /** Every refusal names the rule, so a refusal by the action check before it fails the row. */
  const expectRoleRefusal = async ({ response, error }: TestResult) => {
    await expectRefusal({ response, error }, 403, 'forbidden');
    expect((error as ErrorResponse).meta?.reason).toBe('role_exceeds_actor');
  };

  describe("must not grant a role above the actor's own", () => {
    const rows: Row[] = [
      {
        act: 'promote themselves to the top role',
        attempt: (fixture, actor) => setRole(fixture, actor, actor, adminRole),
        unchanged: async ({ org, member }) => expect((await membershipOf(member.id, org.id)).role).toBe(memberRole),
        okStatus: 200,
      },
      {
        act: 'invite someone at the top role',
        attempt: (fixture, actor) => invite(fixture, actor, `newcomer-${actor.id}@security-test.com`, adminRole),
        unchanged: async ({ member }) => expect(await invitationsTo(`newcomer-${member.id}@security-test.com`)).toEqual([]),
        okStatus: 200,
      },
      {
        act: 'raise a pending invitation to the top role',
        attempt: (fixture, actor) => invite(fixture, actor, fixture.invitee, adminRole),
        unchanged: async ({ invitee }) => expect((await invitationsTo(invitee)).map(({ role }) => role)).toEqual([memberRole]),
        okStatus: 200,
      },
      {
        act: 'demote a holder of the top role',
        attempt: (fixture, actor) => setRole(fixture, actor, fixture.otherAdmin, memberRole),
        unchanged: async ({ org, otherAdmin }) => expect((await membershipOf(otherAdmin.id, org.id)).role).toBe(adminRole),
        okStatus: 200,
      },
      {
        act: 'remove a holder of the top role',
        attempt: ({ org, otherAdmin }, actor) =>
          call(deleteMemberships, {
            path: { tenantId: org.tenantId, organizationId: org.id },
            query: { entityId: org.id, entityType: 'organization' },
            body: { ids: [otherAdmin.id] },
            headers: headers(actor),
          }),
        unchanged: async ({ org, otherAdmin }) => expect(await membershipOf(otherAdmin.id, org.id)).toBeDefined(),
        okStatus: 200,
      },
    ];

    it.each(rows)('must not $act via a lower role that manages the organization', async ({ attempt, unchanged }) => {
      const shared = await fixture('grant');
      await expectRoleRefusal(await attempt(shared, shared.member));
      await unchanged(shared);
    });

    it('lets the top role do each, the lower role hand out its own, and a system admin hand out any (rightful controls)', async () => {
      for (const { act, attempt, okStatus } of rows) {
        const own = await fixture('grant-control');
        expect((await attempt(own, own.admin)).response.status, act).toBe(okStatus);
      }

      const own = await fixture('grant-floor');
      expect((await invite(own, own.member, 'floor@security-test.com', memberRole)).response.status).toBe(200);
      expect((await invitationsTo('floor@security-test.com')).map(({ role }) => role)).toEqual([memberRole]);

      const sysAdmin = await createSystemAdminUser('grant-sysadmin@security-test.com');
      const asSysAdmin = { ...sysAdmin, sessionCookie: await createTestSession(sysAdmin) };
      expect((await invite(own, asSysAdmin, 'by-sysadmin@security-test.com', adminRole)).response.status).toBe(200);
    });
  });

  describe("must not manage a service account whose role outranks the actor's", () => {
    const rows: Row[] = [
      {
        act: 'create a service account at the top role',
        attempt: ({ org }, actor) =>
          call(createServiceAccount, {
            path: { tenantId: org.tenantId, organizationId: org.id },
            body: { name: 'mine', role: adminRole },
            headers: headers(actor),
          }),
        unchanged: async ({ org }) =>
          expect(await db.select().from(serviceAccountsTable).where(eq(serviceAccountsTable.tenantId, org.tenantId))).toHaveLength(2),
        okStatus: 201,
      },
      {
        act: 'issue a key for a service account at the top role',
        attempt: (fixture, actor) =>
          call(createApiKey, { path: accountPath(fixture, fixture.account), body: { name: 'mine' }, headers: headers(actor) }),
        unchanged: async ({ account }) => expect(await keysOf(account)).toHaveLength(1),
        okStatus: 201,
      },
      {
        act: 'roll the key of a service account at the top role',
        attempt: (fixture, actor) =>
          call(createApiKey, {
            path: accountPath(fixture, fixture.account),
            body: { name: 'mine', rollFrom: fixture.apiKey, rollOverlapDays: 1 },
            headers: headers(actor),
          }),
        unchanged: async ({ account }) => expect((await keysOf(account)).map(({ expiresAt }) => expiresAt)).toEqual([null]),
        okStatus: 201,
      },
      {
        act: 're-enable a service account at the top role',
        attempt: (fixture, actor) =>
          call(updateServiceAccount, { path: accountPath(fixture, fixture.disabledAccount), body: { status: 'active' }, headers: headers(actor) }),
        unchanged: async ({ disabledAccount }) => expect(await statusOf(disabledAccount)).toBe('disabled'),
        okStatus: 200,
      },
    ];

    it.each(rows)('must not $act via a lower role that manages the organization', async ({ attempt, unchanged }) => {
      const shared = await fixture('account');
      await expectRoleRefusal(await attempt(shared, shared.member));
      await unchanged(shared);
    });

    it('lets the top role do each and the lower role manage an account at its own role (rightful controls)', async () => {
      for (const { act, attempt, okStatus } of rows) {
        const own = await fixture('account-control');
        expect((await attempt(own, own.admin)).response.status, act).toBe(okStatus);
      }

      const own = await fixture('account-floor');
      const { serviceAccount: account } = await serviceAccount(own.org, own.admin, memberRole);
      const issued = await call(createApiKey, { path: accountPath(own, account.id), body: { name: 'mine' }, headers: headers(own.member) });
      expect(issued.response.status).toBe(201);
    });
  });
});
