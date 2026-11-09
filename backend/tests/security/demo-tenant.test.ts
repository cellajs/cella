import { and, count, eq, isNull } from 'drizzle-orm';
import {
  acceptInvitationToken,
  confirmInvitationAddress,
  createDemo,
  createTenant,
  createTotp,
  getOrganization,
  getPublicCounts,
  inviteMembers,
  listOrganizations,
  listTenants,
  listUsers,
  sendStepUpCode,
} from 'sdk';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { actorsTable } from '#/modules/actors/actors-db';
import { sessionsTable } from '#/modules/auth/sessions/sessions-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { removeDueTenants } from '#/modules/tenants/operations/remove-due-tenants';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';
import { adminRole, defaultHeaders, memberRole, overrideConfig } from '../fixtures';
import {
  CookieJar,
  createOrganizationAdminUser,
  createSystemAdminUser,
  createTestSession,
  expectRefusal,
  openHeldLink,
  sentMails,
  setCookiePair,
} from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, createTestTenant } from './helpers';

overrideConfig(appConfig.has, { demos: true });

afterEach(clearSecurityTestData);

type TenantAnswer = { id: string; kind: string; expiresAt: string | null; organization: { id: string; slug: string } };

/** A page of ids as a list answers it. */
const idsOf = ({ data }: { data: unknown }) => (data as { results: { id: string }[] }).results.map(({ id }) => id);

/** A session not revoked: a replaced one keeps its row. */
const isLive = () => isNull(sessionsTable.revokedAt);

const rows = async (table: typeof usersTable | typeof actorsTable | typeof tenantsTable, id: string) =>
  (await db.select({ total: count() }).from(table).where(eq(table.id, id)))[0].total;

/**
 * A demo is a visitor's throwaway: an account nobody signed up for, in a tenant that goes after two days. It must stay
 * that: nothing it does may mail a third party, outlive its tenant or turn it into an account.
 */
describe('Demo tenants', async () => {
  const call = await createAppClient();

  /** Takes a demo from a browser of its own, as a visitor does. */
  const takeDemo = async () => {
    const answer = await call(createDemo, {
      headers: { ...defaultHeaders, 'x-forwarded-for': `10.0.${Math.floor(Math.random() * 250)}.${nanoid(2).length}` },
    });
    expect(answer.response.status).toBe(201);
    const tenant = answer.data as TenantAnswer;
    const cookie = setCookiePair(answer.response, 'session');
    const [demoUser] = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(tenantsTable)
      .innerJoin(usersTable, eq(usersTable.id, tenantsTable.createdBy))
      .where(eq(tenantsTable.id, tenant.id));
    return { tenant, headers: { ...defaultHeaders, Cookie: cookie }, user: demoUser };
  };

  it('must not let a demo session create a tenant, set up a sign-in method or invite anyone, while a live admin invites', async () => {
    const demo = await takeDemo();
    expect(demo.tenant.kind).toBe('demo');
    expect(demo.tenant.expiresAt).not.toBeNull();
    expect(demo.user.email.endsWith(`@${appConfig.demo.addressDomain}`)).toBe(true);

    const tenant = await call(createTenant, { body: { name: 'Escape' }, headers: demo.headers });
    await expectRefusal(tenant, 403, 'demo_session_restricted');

    const totp = await call(createTotp, { body: { code: '000000' }, headers: demo.headers });
    await expectRefusal(totp, 403, 'demo_session_restricted');

    const invite = (tenantId: string, organizationId: string) => ({
      path: { tenantId, organizationId },
      query: { entityType: 'organization' as const, entityId: organizationId },
      body: { emails: ['third-party@security-test.com'], role: memberRole },
    });
    const invited = await call(inviteMembers, { ...invite(demo.tenant.id, demo.tenant.organization.id), headers: demo.headers });
    await expectRefusal(invited, 403, 'restrict_by_tenant_kind');
    expect(sentMails()).toHaveLength(0);

    // The rightful user: an admin of a live tenant invites, and the invitation mails out.
    const live = await createTestTenant(call, 'demo-live');
    const liveInvite = await call(inviteMembers, {
      ...invite(live.tenantId, live.organization.id),
      headers: { ...defaultHeaders, Cookie: live.sessionCookie },
    });
    expect(liveInvite.response.status).toBe(200);
    expect(sentMails().map(({ recipient }) => recipient.email)).toEqual(['third-party@security-test.com']);
  });

  it('signs a demo in for no longer than its tenant, and gives a browser whose demo ended a new one', async () => {
    const demo = await takeDemo();
    const [session] = await db.select({ expiresAt: sessionsTable.expiresAt }).from(sessionsTable).where(eq(sessionsTable.userId, demo.user.id));
    expect(session.expiresAt <= String(demo.tenant.expiresAt)).toBe(true);

    await db
      .update(tenantsTable)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(tenantsTable.id, demo.tenant.id));
    const next = await call(createDemo, { headers: { ...demo.headers, 'x-forwarded-for': '10.200.0.1' } });
    expect(next.response.status).toBe(201);
    expect((next.data as TenantAnswer).id).not.toBe(demo.tenant.id);
    expect(
      (
        await db
          .select()
          .from(sessionsTable)
          .where(and(eq(sessionsTable.userId, demo.user.id), isLive()))
      ).length,
    ).toBe(0);
  });

  it('must not let a demo account bind or accept an invitation, nor be mailed a step-up code', async () => {
    const demo = await takeDemo();
    const live = await createTestTenant(call, 'demo-invited');
    const { rawToken } = await createInvitation({
      organization: { id: live.organization.id, tenantId: live.tenantId },
      email: `invited-${nanoid(6)}@security-test.com`,
      createdBy: live.user.id,
    });
    const browser = new CookieJar([demo.headers.Cookie]);
    await openHeldLink('invitation', rawToken, browser);
    const asDemo = () => ({ headers: { ...defaultHeaders, Cookie: browser.header() } });

    await expectRefusal(await call(confirmInvitationAddress, asDemo()), 403, 'provisional_account');
    await expectRefusal(await call(acceptInvitationToken, asDemo()), 403, 'provisional_account');
    await expectRefusal(await call(sendStepUpCode, { headers: demo.headers }), 400, 'invalid_request');
    expect(sentMails()).toHaveLength(0);
    const elsewhere = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, demo.user.id), eq(membershipsTable.tenantId, live.tenantId)));
    expect(elsewhere).toEqual([]);
  });

  it('gives a browser its demo back, refuses a signed-in account and is gone while the feature is off', async () => {
    const demo = await takeDemo();
    const again = await call(createDemo, { headers: demo.headers });
    expect(again.response.status).toBe(200);
    expect((again.data as TenantAnswer).id).toBe(demo.tenant.id);

    const live = await createTestTenant(call, 'demo-signed-in');
    const signedIn = await call(createDemo, { headers: { ...defaultHeaders, Cookie: live.sessionCookie } });
    await expectRefusal(signedIn, 409, 'demo_signed_in');

    const restore = overrideConfig(appConfig.has, { demos: false });
    try {
      const off = await call(createDemo, { headers: defaultHeaders });
      expect(off.response.status).toBe(404);
    } finally {
      restore();
    }
  });

  it('ends an expired demo at once and removes it with its account and actor, keeping an account with a proven address', async () => {
    const demo = await takeDemo();
    const proven = await createOrganizationAdminUser(
      `demo-guest-${nanoid(6)}@security-test.com`,
      demo.tenant.organization.id,
      adminRole,
      demo.tenant.id,
    );
    const path = { tenantId: demo.tenant.id, organizationId: demo.tenant.organization.id };
    expect((await call(getOrganization, { path, headers: demo.headers })).response.status).toBe(200);

    await db
      .update(tenantsTable)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(tenantsTable.id, demo.tenant.id));
    // The guard reads the tenant from its cache; the update above goes through no cache, so a fresh read is forced.
    const { invalidateCache } = await import('#/middlewares/guard/invalidate-cache');
    invalidateCache.tenant(demo.tenant.id);
    const expired = await call(getOrganization, { path, headers: demo.headers });
    expect(expired.response.status).toBe(403);

    expect(await removeDueTenants()).toBe(1);

    expect(await rows(tenantsTable, demo.tenant.id)).toBe(0);
    expect(await rows(usersTable, demo.user.id)).toBe(0);
    expect(await rows(actorsTable, demo.user.id)).toBe(0);
    expect(await rows(usersTable, proven.id)).toBe(1);
    // A demo held no customer's data: the operator gets no removal mail.
    expect(sentMails()).toHaveLength(0);
    const gone = await call(createDemo, { headers: demo.headers });
    expect([201, 503]).toContain(gone.response.status);
  });

  it('keeps test and demo tenants out of the public counts and the admin lists until asked for', async () => {
    const live = await createTestTenant(call, 'demo-counted');
    const test = await createTestTenant(call, 'demo-test');
    await db.update(tenantsTable).set({ kind: 'test' }).where(eq(tenantsTable.id, test.tenantId));
    const demo = await takeDemo();
    const admin = await createSystemAdminUser(`demo-sysadmin-${nanoid(6)}@security-test.com`);
    const headers = { ...defaultHeaders, Cookie: await createTestSession(admin) };

    const counts = (await call(getPublicCounts, { headers: defaultHeaders })).data as { user: number; organization: number };
    const [{ organizations }] = await db.select({ organizations: count() }).from(organizationsTable);
    const [{ proven }] = await db.select({ proven: count() }).from(emailsTable);
    // Of the three organizations only the live one counts; of the proven accounts the test tenant's member stays out.
    expect(organizations).toBe(3);
    expect(counts.organization).toBe(1);
    expect(counts.user).toBe(proven - 1);

    expect(idsOf(await call(listTenants, { headers }))).toEqual([live.tenantId]);
    expect(idsOf(await call(listTenants, { query: { kind: 'test,demo' }, headers })).sort()).toEqual([test.tenantId, demo.tenant.id].sort());
    expect(idsOf(await call(listOrganizations, { headers }))).toEqual([live.organization.id]);
    expect(idsOf(await call(listOrganizations, { query: { kind: 'demo' }, headers }))).toEqual([demo.tenant.organization.id]);
    expect(idsOf(await call(listUsers, { headers }))).not.toContain(demo.user.id);
    expect(idsOf(await call(listUsers, { query: { includeProvisional: true }, headers }))).toContain(demo.user.id);
    // A member asking for provisional accounts is refused: the switch belongs to the system table.
    const member = await call(listUsers, { query: { includeProvisional: true }, headers: { ...defaultHeaders, Cookie: live.sessionCookie } });
    await expectRefusal(member, 403, 'forbidden');
  });
});
