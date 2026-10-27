import { eq } from 'drizzle-orm';
import { getMyInvitations, getPendingMemberships, membershipInvite, publishOrganization, resendPendingInvitation } from 'sdk';
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

// Unpublished contexts hold invites until publishing calls `dispatchDeferredInvites`; the hierarchy's `drafts.prepareRoles`
// (admin, for an organization) are invited at once.
describe('Draft context invite deferral', async () => {
  const call = await createAppClient();

  // The publish flow's operation reads only `db` from its context, and the organization when there is one, so a partial one stands in.
  const publisherContext = (user: { id: string }) => ({ var: { db, user } }) as unknown as UserContext;

  const createDraftOrgWorld = async () => {
    const organization = await createTestOrganization({ publishedAt: null });
    const admin = await createOrganizationAdminUser('admin@example.com', organization.id, adminRole, organization.tenantId);
    const sessionCookie = await createTestSession(admin);
    return { organization, admin, sessionCookie };
  };

  const publish = (organization: { id: string; tenantId: string }, sessionCookie: string) =>
    call(publishOrganization, {
      path: { tenantId: organization.tenantId, id: organization.id },
      headers: { ...defaultHeaders, Cookie: sessionCookie },
    });

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
    expect(mailer.sendEmails).not.toHaveBeenCalled();

    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.channelId, organization.id));
    expect(memberships).toHaveLength(1); // only the inviting admin
  });

  it('keeps prepare roles live: admin invites dispatch on a draft context', async () => {
    const { organization, sessionCookie } = await createDraftOrgWorld();

    const { response } = await invite(organization, ['co-admin@example.com'], adminRole, sessionCookie);
    expect(response.status).toBe(200);

    const [row] = await getInactiveRows(organization.id);
    expect(row).toBeDefined();
    expect(row.role).toBe('admin');
    expect(row.remindedAt).not.toBeNull(); // the mail went out, so the invitation is not held
    expect(mailer.sendEmails).toHaveBeenCalledOnce();
  });

  it('lists a prepare-role invitation to an account while the context is a draft, so the emailed invitee can answer it', async () => {
    const { organization, sessionCookie } = await createDraftOrgWorld();
    const coAdmin = await createTestUser('co-admin@example.com');

    await invite(organization, [coAdmin.email], adminRole, sessionCookie);

    const { data } = await call(getMyInvitations, { headers: { ...defaultHeaders, Cookie: await createTestSession(coAdmin) } });
    expect((data as { items: unknown[] }).items).toHaveLength(1);
  });

  it('refuses a member who publishes, leaving the draft and its held invitations as they were', async () => {
    const { organization, sessionCookie } = await createDraftOrgWorld();
    await invite(organization, ['held@example.com'], memberRole, sessionCookie);
    const member = await createOrganizationAdminUser('member@example.com', organization.id, memberRole, organization.tenantId);

    const { response } = await publish(organization, await createTestSession(member));
    expect(response.status).toBe(403);

    const [stored] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, organization.id));
    expect(stored.publishedAt).toBeNull();
    expect(mailsTo('held@example.com')).toHaveLength(0);
  });

  it('hides deferred invites from the invitee until the organization is published', async () => {
    const { organization, sessionCookie } = await createDraftOrgWorld();
    const invitee = await createTestUser('invitee@example.com');

    await invite(organization, [invitee.email], memberRole, sessionCookie);

    const inviteeCookie = await createTestSession(invitee);
    const myInvitations = () => call(getMyInvitations, { headers: { ...defaultHeaders, Cookie: inviteeCookie } });

    const before = await myInvitations();
    expect(before.response.status).toBe(200);
    expect((before.data as { items: unknown[] }).items).toHaveLength(0);

    const { data: published } = await publish(organization, sessionCookie);
    expect(published).toMatchObject({ invitationsSent: 1, organization: { id: organization.id, publishedAt: expect.any(String) } });

    const after = await myInvitations();
    expect((after.data as { items: unknown[] }).items).toHaveLength(1);
  });

  it('keeps a held invitation held when it is resent, and sends it at the publish', async () => {
    const { organization, sessionCookie } = await createDraftOrgWorld();
    await invite(organization, ['held@example.com'], memberRole, sessionCookie);
    const [held] = await getInactiveRows(organization.id);

    const { response } = await call(resendPendingInvitation, {
      path: { tenantId: organization.tenantId, organizationId: organization.id, id: held.id },
      headers: { ...defaultHeaders, Cookie: sessionCookie },
    });
    expect(response.status).toBe(204);
    expect(mailsTo('held@example.com')).toHaveLength(0);

    const { data } = await publish(organization, sessionCookie);
    expect(data).toMatchObject({ invitationsSent: 1 });
    expect(mailsTo('held@example.com')).toHaveLength(1);
  });

  it("names the inviter in a held invitation's mail, whoever publishes", async () => {
    const { organization, admin, sessionCookie } = await createDraftOrgWorld();
    await invite(organization, ['held@example.com'], memberRole, sessionCookie);
    const publisher = await createOrganizationAdminUser('publisher@example.com', organization.id, adminRole, organization.tenantId);

    await publish(organization, await createTestSession(publisher));

    const [mail] = mailsTo('held@example.com');
    expect(mail.statics.senderName).toBe(admin.name);
  });

  it('dispatch rotates tokens, stamps remindedAt, and sends a held invitation once', async () => {
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

    // Second dispatch: the invitation is no longer held, so no re-send and no token churn
    const second = await dispatchDeferredInvites(ctx, { channelIds: [organization.id] });
    expect(second.dispatched).toBe(0);
    const [afterSecond] = await getInactiveRows(organization.id);
    expect(afterSecond.remindedAt).toBe(afterRow.remindedAt);
    expect((await linksOf(afterSecond.id)).map((link) => link.id)).toEqual([rotated.id]);
  });

  it('dispatches the held invitations alone: one mailed when it was made keeps its link', async () => {
    const { organization, admin, sessionCookie } = await createDraftOrgWorld();

    // The most privileged role is mailed on a draft; the member invitation is held.
    await invite(organization, ['co-admin@example.com'], adminRole, sessionCookie);
    await invite(organization, ['held@example.com'], memberRole, sessionCookie);
    const mailed = (await getInactiveRows(organization.id)).find((row) => row.email === 'co-admin@example.com')!;
    const [mailedLink] = await linksOf(mailed.id);

    const { dispatched } = await dispatchDeferredInvites(publisherContext(admin), { channelIds: [organization.id] });
    expect(dispatched).toBe(1);
    expect(mailsTo('co-admin@example.com')).toHaveLength(1);
    expect(mailsTo('held@example.com')).toHaveLength(1);
    expect((await linksOf(mailed.id)).map((link) => link.id)).toEqual([mailedLink.id]);
  });

  it('dispatches nothing for a published context whose invitations were mailed when they were made', async () => {
    const organization = await createTestOrganization();
    const admin = await createOrganizationAdminUser('admin@example.com', organization.id, adminRole, organization.tenantId);
    await invite(organization, ['mailed@example.com'], memberRole, await createTestSession(admin));
    const [mailed] = await getInactiveRows(organization.id);
    const [mailedLink] = await linksOf(mailed.id);

    // A publish flow that runs again hands over a context it published before.
    const { dispatched } = await dispatchDeferredInvites(publisherContext(admin), { channelIds: [organization.id] });
    expect(dispatched).toBe(0);
    expect(mailsTo('mailed@example.com')).toHaveLength(1);
    expect((await linksOf(mailed.id)).map((link) => link.id)).toEqual([mailedLink.id]);
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

  it('sends a pending invitation again whenever its address is added again', async () => {
    const organization = await createTestOrganization();
    const admin = await createOrganizationAdminUser('admin@example.com', organization.id, adminRole, organization.tenantId);
    const sessionCookie = await createTestSession(admin);
    const invitee = await createTestUser('pending@example.com');

    await invite(organization, [invitee.email], memberRole, sessionCookie);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [initial] = await getInactiveRows(organization.id);
    await db.update(inactiveMembershipsTable).set({ remindedAt: hourAgo }).where(eq(inactiveMembershipsTable.id, initial.id));

    // Re-adding the address is as deliberate as the resend button, so the email goes out again at once.
    const { data } = await invite(organization, [invitee.email], memberRole, sessionCookie);
    expect(data).toMatchObject({ outcomes: [{ email: invitee.email, outcome: 'remind', invitedAt: initial.createdAt }] });
    expect(mailsTo(invitee.email)).toHaveLength(2);
    const [reminded] = await getInactiveRows(organization.id);
    expect(reminded.remindedAt).not.toBe(hourAgo);
  });

  it('reminds a pending invitation to a new address with a fresh link that retires the one mailed before', async () => {
    const organization = await createTestOrganization();
    const admin = await createOrganizationAdminUser('admin@example.com', organization.id, adminRole, organization.tenantId);
    const sessionCookie = await createTestSession(admin);
    const newcomer = 'newcomer@example.com';

    await invite(organization, [newcomer], memberRole, sessionCookie);
    const [initial] = await getInactiveRows(organization.id);
    const [initialLink] = await linksOf(initial.id);

    await invite(organization, [newcomer], memberRole, sessionCookie);
    const links = await linksOf(initial.id);
    expect(links).toHaveLength(1);
    expect(links[0].id).not.toBe(initialLink.id);
    expect(links[0].secret).toBe(hashToken(mailedLink('inviteLink').token));
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
