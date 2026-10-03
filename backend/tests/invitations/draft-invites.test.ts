import { eq } from 'drizzle-orm';
import { getMyInvitations, getPendingMemberships, membershipInvite } from 'sdk';
import type { EntityRole } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { UserContext } from '#/core/context';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { tokensTable } from '#/modules/auth/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { dispatchDeferredInvites } from '#/modules/memberships/operations/deferred-invites';
import { organizationsTable } from '#/modules/organization/organization-db';
import { handleCreateUser } from '#/modules/user/operations/create-account';
import { hashToken } from '#/utils/hash-token';
import { adminRole, defaultHeaders, memberRole } from '../fixtures';
import { createOrganizationAdminUser, createTestOrganization, createTestSession, createTestUser, mailedLink, mailsTo } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, setTestConfig } from '../test-utils';

// Whether an invite left as mail is the observable difference between a held and a dispatched invite.
setTestConfig({ enabledAuthStrategies: ['passkey'], selfRegistration: true });

afterEach(async () => await clearDatabase());

// Unpublished contexts hold invites until the publish flow calls `dispatchDeferredInvites`.
// The template creates published contexts, so these tests explicitly clear `publishedAt`.
describe('Draft context invite deferral', async () => {
  const call = await createAppClient();

  // The publish flow's operation reads only `db` and `user` from its context, so a partial one stands in.
  const publisherContext = (user: { id: string }) => ({ var: { db, user } }) as unknown as UserContext;

  const createDraftOrgWorld = async () => {
    const organization = await createTestOrganization();
    const admin = await createOrganizationAdminUser('admin@example.com', organization.id, adminRole, organization.tenantId);
    const sessionCookie = await createTestSession(admin);
    // The template always publishes at creation; draft state is an app-specific flow.
    await db.update(organizationsTable).set({ publishedAt: null }).where(eq(organizationsTable.id, organization.id));
    return { organization, admin, sessionCookie };
  };

  const invite = async (organization: { id: string; tenantId: string }, emails: string[], role: EntityRole, sessionCookie: string) => {
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

  /** The link tokens of an invitation: one while it goes by link, none once an account answers it in-app. */
  const linksOf = (invitationId: string) => db.select().from(tokensTable).where(eq(tokensTable.inactiveMembershipId, invitationId));

  it('defers member invites against a draft context (row created, no dispatch, no membership)', async () => {
    const { organization, sessionCookie } = await createDraftOrgWorld();

    const { response } = await invite(organization, ['new-member@example.com'], memberRole, sessionCookie);
    expect(response.status).toBe(200);

    const [row] = await getInactiveRows(organization.id);
    expect(row).toBeDefined();
    expect(row.role).toBe(memberRole);
    expect(await linksOf(row.id)).toHaveLength(1); // token minted for the new user
    expect(row.remindedAt).toBeNull(); // but email dispatch was held
    expect(mailer.prepareEmails).not.toHaveBeenCalled();

    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.channelId, organization.id));
    expect(memberships).toHaveLength(1); // only the inviting admin
  });

  it('keeps the most-privileged role live: admin invites dispatch on a draft context', async () => {
    const { organization, sessionCookie } = await createDraftOrgWorld();

    const { response } = await invite(organization, ['co-admin@example.com'], adminRole, sessionCookie);
    expect(response.status).toBe(200);

    const [row] = await getInactiveRows(organization.id);
    expect(row).toBeDefined();
    expect(row.role).toBe('admin');
    expect(row.remindedAt).toBeNull(); // initial invite email is not a reminder stamp
    expect(mailer.prepareEmails).toHaveBeenCalledOnce();
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
    await db.update(organizationsTable).set({ publishedAt: new Date().toISOString() }).where(eq(organizationsTable.id, organization.id));
    await dispatchDeferredInvites(publisherContext(admin), { channelIds: [organization.id] });

    const after = await myInvitations();
    expect((after.data as { items: unknown[] }).items).toHaveLength(1);
  });

  it('dispatch rotates tokens, stamps remindedAt, and honors the 7-day throttle', async () => {
    const { organization, admin, sessionCookie } = await createDraftOrgWorld();

    await invite(organization, ['deferred@example.com'], memberRole, sessionCookie);
    const [beforeRow] = await getInactiveRows(organization.id);
    const [original] = await linksOf(beforeRow.id);
    expect(beforeRow.remindedAt).toBeNull();

    const ctx = publisherContext(admin);
    const first = await dispatchDeferredInvites(ctx, { channelIds: [organization.id] });
    expect(first.dispatched).toBe(1);

    const [afterRow] = await getInactiveRows(organization.id);
    expect(afterRow.remindedAt).not.toBeNull();
    const rotatedLinks = await linksOf(afterRow.id);
    expect(rotatedLinks).toHaveLength(1);
    const [rotated] = rotatedLinks;
    expect(rotated.id).not.toBe(original.id); // raw secrets are unrecoverable → rotate
    // The dispatched mail carries the rotated token's link.
    expect(rotated.secret).toBe(hashToken(mailedLink('inviteLink').token));

    // Second dispatch inside the throttle window: no re-send, no token churn
    const second = await dispatchDeferredInvites(ctx, { channelIds: [organization.id] });
    expect(second.dispatched).toBe(0);
    const [afterSecond] = await getInactiveRows(organization.id);
    expect(afterSecond.remindedAt).toBe(afterRow.remindedAt);
    expect((await linksOf(afterSecond.id)).map((link) => link.id)).toEqual([rotated.id]);
  });

  it('lists a dispatched invite once: rotating its link retires the old one', async () => {
    const { organization, admin, sessionCookie } = await createDraftOrgWorld();
    await invite(organization, ['deferred@example.com'], memberRole, sessionCookie);
    const [held] = await getInactiveRows(organization.id);
    const [heldLink] = await linksOf(held.id);

    await db.update(organizationsTable).set({ publishedAt: new Date().toISOString() }).where(eq(organizationsTable.id, organization.id));
    await dispatchDeferredInvites(publisherContext(admin), { channelIds: [organization.id] });

    const links = await linksOf(held.id);
    expect(links).toHaveLength(1);
    expect(links[0].id).not.toBe(heldLink.id);

    const { data } = await call(getPendingMemberships, {
      path: { tenantId: organization.tenantId, organizationId: organization.id },
      query: { entityId: organization.id, entityType: 'organization' },
      headers: { ...defaultHeaders, Cookie: sessionCookie },
    });
    const listed = (data as { items: { id: string; email: string }[] }).items;
    expect(listed.filter((item) => item.id === held.id)).toEqual([expect.objectContaining({ email: 'deferred@example.com' })]);
  });

  it('throttles reminder emails to once per 7 days on published contexts', async () => {
    const organization = await createTestOrganization();
    const admin = await createOrganizationAdminUser('admin@example.com', organization.id, adminRole, organization.tenantId);
    const sessionCookie = await createTestSession(admin);
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
    await db.update(inactiveMembershipsTable).set({ remindedAt: eightDaysAgo }).where(eq(inactiveMembershipsTable.id, initial.id));
    const [aged] = await getInactiveRows(organization.id);

    await invite(organization, [invitee.email], memberRole, sessionCookie);
    const [afterDueReinvite] = await getInactiveRows(organization.id);
    expect(afterDueReinvite.remindedAt).not.toBeNull();
    expect(afterDueReinvite.remindedAt).not.toBe(aged.remindedAt);
    expect(new Date(afterDueReinvite.remindedAt!).getTime()).toBeGreaterThan(Date.now() - 24 * 60 * 60 * 1000);
  });

  it('reminds a pending invitation to a new address as one to an account, minting no further link', async () => {
    const organization = await createTestOrganization();
    const admin = await createOrganizationAdminUser('admin@example.com', organization.id, adminRole, organization.tenantId);
    const sessionCookie = await createTestSession(admin);
    const newcomer = 'newcomer@example.com';

    await invite(organization, [newcomer], memberRole, sessionCookie);
    const [initial] = await getInactiveRows(organization.id);
    const [initialLink] = await linksOf(initial.id);
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await db.update(inactiveMembershipsTable).set({ remindedAt: eightDaysAgo }).where(eq(inactiveMembershipsTable.id, initial.id));

    const { data } = await invite(organization, [newcomer], memberRole, sessionCookie);
    expect(data).toMatchObject({ rejectedIds: [], invitesSentCount: 0 });
    const [reminded] = await getInactiveRows(organization.id);
    expect(new Date(reminded.remindedAt!).getTime()).toBeGreaterThan(Date.now() - 24 * 60 * 60 * 1000);
    // The emailed link stays the one link: a reminder mints no token.
    const links = await db.select().from(tokensTable).where(eq(tokensTable.email, newcomer));
    expect(links.map((link) => link.id)).toEqual([initialLink.id]);
  });

  it('dispatches a held invite to an invitee who signed up meanwhile as one to an account, minting no link', async () => {
    const { organization, admin, sessionCookie } = await createDraftOrgWorld();
    const newcomer = 'newcomer@example.com';
    await invite(organization, [newcomer], memberRole, sessionCookie);

    // The invitee signs up before the context is published: the proven inbox binds the held invitation and ends its link.
    const account = await handleCreateUser(
      { var: { db } },
      { newUser: { email: newcomer, name: 'New Comer', slug: 'newcomer', firstName: 'New', lastName: 'Comer' }, via: 'magic' },
    );
    const [bound] = await getInactiveRows(organization.id);
    expect(bound.userId).toBe(account.id);
    expect(await db.select().from(tokensTable).where(eq(tokensTable.email, newcomer))).toHaveLength(0);

    await db.update(organizationsTable).set({ publishedAt: new Date().toISOString() }).where(eq(organizationsTable.id, organization.id));
    const { dispatched } = await dispatchDeferredInvites(publisherContext(admin), { channelIds: [organization.id] });
    expect(dispatched).toBe(1);

    // An account answers in-app: the mail links the channel's page, and no token is minted for it.
    expect(await db.select().from(tokensTable).where(eq(tokensTable.email, newcomer))).toHaveLength(0);
    const [mail] = mailsTo(newcomer);
    expect(mail.recipient).toHaveProperty('memberInviteLink');
    expect(mail.recipient).not.toHaveProperty('inviteLink');
  });
});
