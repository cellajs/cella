import { eq } from 'drizzle-orm';
import { getMyInvitations, membershipInvite } from 'sdk';
import { type EntityRole, hierarchy } from 'shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AuthContext } from '#/core/context';
import { baseDb as db } from '#/db/db';
import { dispatchDeferredInvites } from '#/modules/memberships/helpers/deferred-invites';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { defaultHeaders } from '../fixtures';
import { createOrganizationAdminUser, createTestOrganization, createTestSession, createTestUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

/** The organization vocabulary's floor role: `member` in cella; apps with other vocabularies still run this file unchanged. */
const memberRole = hierarchy.getLeastPrivilegedRole('organization');

setTestConfig({
  enabledAuthStrategies: ['passkey'],
  selfRegistration: true,
});

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => await clearDatabase());

// Unpublished contexts hold invites until the publish flow calls `dispatchDeferredInvites`.
// The template creates published contexts, so these tests explicitly clear `publishedAt`.
describe('Draft context invite deferral', async () => {
  const call = await createAppClient();

  const createDraftOrgWorld = async () => {
    const organization = await createTestOrganization();
    const admin = await createOrganizationAdminUser(
      'admin@example.com',
      organization.id,
      'admin',
      true,
      organization.tenantId,
    );
    const sessionCookie = await createTestSession(admin);
    // The template always publishes at creation; draft state is an app-specific flow.
    await db.update(organizationsTable).set({ publishedAt: null }).where(eq(organizationsTable.id, organization.id));
    return { organization, admin, sessionCookie };
  };

  const invite = async (
    organization: { id: string; tenantId: string },
    emails: string[],
    role: EntityRole,
    sessionCookie: string,
  ) => {
    return await call(membershipInvite, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      body: { emails, role },
      query: { entityId: organization.id, entityType: 'organization' as const },
      headers: { ...defaultHeaders, Cookie: sessionCookie },
    });
  };

  const getInactiveRows = async (channelId: string) => {
    return await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.channelId, channelId));
  };

  it('defers member invites against a draft context (row created, no dispatch, no membership)', async () => {
    const { organization, sessionCookie } = await createDraftOrgWorld();

    const { response } = await invite(organization, ['new-member@example.com'], memberRole, sessionCookie);
    expect(response.status).toBe(200);

    const [row] = await getInactiveRows(organization.id);
    expect(row).toBeDefined();
    expect(row.role).toBe(memberRole);
    expect(row.tokenId).toBeTruthy(); // token minted for the new user
    expect(row.remindedAt).toBeNull(); // but email dispatch was held

    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.channelId, organization.id));
    expect(memberships).toHaveLength(1); // only the inviting admin
  });

  it('keeps the most-privileged role live: admin invites dispatch on a draft context', async () => {
    const { organization, sessionCookie } = await createDraftOrgWorld();

    const { response } = await invite(organization, ['co-admin@example.com'], 'admin', sessionCookie);
    expect(response.status).toBe(200);

    const [row] = await getInactiveRows(organization.id);
    expect(row).toBeDefined();
    expect(row.role).toBe('admin');
    expect(row.remindedAt).toBeNull(); // initial invite email is not a reminder stamp
  });

  it('hides deferred invites from the invitee until dispatch', async () => {
    const { organization, admin, sessionCookie } = await createDraftOrgWorld();
    const invitee = await createTestUser('invitee@example.com');

    await invite(organization, [invitee.email], memberRole, sessionCookie);

    const inviteeCookie = await createTestSession(invitee);
    const myInvitations = () => call(getMyInvitations, { headers: { ...defaultHeaders, Cookie: inviteeCookie } });

    const before = await myInvitations();
    expect(before.response.status).toBe(200);
    expect((before.data as { items: unknown[] }).items).toHaveLength(0);

    // An app's publish flow: stamp publishedAt, then release the held invites
    await db
      .update(organizationsTable)
      .set({ publishedAt: new Date().toISOString() })
      .where(eq(organizationsTable.id, organization.id));
    await dispatchDeferredInvites({ var: { db, user: admin } } as unknown as AuthContext, {
      channelIds: [organization.id],
    });

    const after = await myInvitations();
    expect((after.data as { items: unknown[] }).items).toHaveLength(1);
  });

  it('dispatch rotates tokens, stamps remindedAt, and honors the 7-day throttle', async () => {
    const { organization, admin, sessionCookie } = await createDraftOrgWorld();

    await invite(organization, ['deferred@example.com'], memberRole, sessionCookie);
    const [beforeRow] = await getInactiveRows(organization.id);
    const originalTokenId = beforeRow.tokenId;
    expect(beforeRow.remindedAt).toBeNull();

    const ctx = { var: { db, user: admin } } as unknown as AuthContext;
    const first = await dispatchDeferredInvites(ctx, { channelIds: [organization.id] });
    expect(first.dispatched).toBe(1);

    const [afterRow] = await getInactiveRows(organization.id);
    expect(afterRow.remindedAt).not.toBeNull();
    expect(afterRow.tokenId).toBeTruthy();
    expect(afterRow.tokenId).not.toBe(originalTokenId); // raw secrets are unrecoverable → rotate

    // Second dispatch inside the throttle window: no re-send, no token churn
    const second = await dispatchDeferredInvites(ctx, { channelIds: [organization.id] });
    expect(second.dispatched).toBe(0);
    const [afterSecond] = await getInactiveRows(organization.id);
    expect(afterSecond.remindedAt).toBe(afterRow.remindedAt);
    expect(afterSecond.tokenId).toBe(afterRow.tokenId);
  });

  it('throttles reminder emails to once per 7 days on published contexts', async () => {
    const organization = await createTestOrganization();
    const admin = await createOrganizationAdminUser(
      'admin@example.com',
      organization.id,
      'admin',
      true,
      organization.tenantId,
    );
    const sessionCookie = await createTestSession(admin);
    // Reminders apply only to invitees with a known email; new-user invites are conflict-suppressed.
    const invitee = await createTestUser('pending@example.com');

    await invite(organization, [invitee.email], memberRole, sessionCookie);
    const [initial] = await getInactiveRows(organization.id);
    expect(initial.remindedAt).toBeNull(); // initial invite email is not a reminder

    // The pending invite was dispatched at creation, so an immediate re-invite sends no reminder.
    await invite(organization, [invitee.email], memberRole, sessionCookie);
    const [afterEarlyReinvite] = await getInactiveRows(organization.id);
    expect(afterEarlyReinvite.remindedAt).toBeNull();

    // The throttle check reads remindedAt, not the immutable createdAt.
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await db
      .update(inactiveMembershipsTable)
      .set({ remindedAt: eightDaysAgo })
      .where(eq(inactiveMembershipsTable.id, initial.id));
    const [aged] = await getInactiveRows(organization.id);

    await invite(organization, [invitee.email], memberRole, sessionCookie);
    const [afterDueReinvite] = await getInactiveRows(organization.id);
    expect(afterDueReinvite.remindedAt).not.toBeNull();
    expect(afterDueReinvite.remindedAt).not.toBe(aged.remindedAt);
    expect(new Date(afterDueReinvite.remindedAt!).getTime()).toBeGreaterThan(Date.now() - 24 * 60 * 60 * 1000);
  });
});
