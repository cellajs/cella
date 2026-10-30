import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { acceptInvitationToken, confirmInvitationAddress, getMe, invokeToken, sendMagicLink } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { emailsTable } from '#/modules/user/emails-db';
import { defaultHeaders } from '../fixtures';
import { CookieJar, createTestOrganization, createTestSession, createTestUser, expectRefusal, mailedLink } from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

setTestConfig({ enabledAuthStrategies: ['magic', 'passkey'], selfRegistration: true });

/**
 * An invitation's confirmation link shows only that whoever holds the invited inbox handed it to a signed-in browser.
 * An attacker invites an address they own and passes both links to a victim, who accepts: the attacker must gain no way
 * to sign in to the victim's account.
 */
describe('invitation address handover', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  const address = (label: string) => `${label}-${nanoid(6)}@security-test.com`.toLowerCase();

  it('must not sign in to the accepting account through a magic link to the invited address', async () => {
    const planted = address('planted');
    const organization = await createTestOrganization();
    const inviter = await createTestUser(address('inviter'));
    const { rawToken } = await createInvitation({ organization, email: planted, createdBy: inviter.id });

    const victim = await createTestUser(address('victim'));
    const victimBrowser = new CookieJar([await createTestSession(victim)]);
    const asVictim = () => ({ headers: { ...defaultHeaders, Cookie: victimBrowser.header() } });
    const openInvitation = async (token: string) =>
      victimBrowser.absorb((await call(invokeToken, { path: { type: 'invitation', token }, ...asVictim() })).response);

    // The victim opens the attacker's link, is asked to confirm the address and has a link sent there.
    await openInvitation(rawToken);
    await expectRefusal(await call(acceptInvitationToken, asVictim()), 403, 'invitation_address_unproven');
    expect((await call(confirmInvitationAddress, asVictim())).response.status).toBe(204);

    // The attacker reads that link at the planted address and passes it on; the victim opens it and accepts.
    await openInvitation(mailedLink('confirmUrl').token);
    expect((await call(acceptInvitationToken, asVictim())).response.status).toBe(200);
    expect(await db.select().from(membershipsTable).where(eq(membershipsTable.userId, victim.id))).toHaveLength(1);
    expect(await db.select().from(emailsTable).where(eq(emailsTable.email, planted))).toEqual([]);

    // In the attacker's own browser a magic link to the planted address names no user: opening it signs up a new account.
    const attackerBrowser = new CookieJar();
    const asked = await call(sendMagicLink, { body: { email: planted }, headers: defaultHeaders });
    expect(asked.response.status).toBe(204);
    attackerBrowser.absorb(asked.response);
    const { token } = await vi.waitFor(() => mailedLink('magicLinkUrl'));
    const opened = await call(invokeToken, {
      path: { type: 'magic', token },
      headers: { ...defaultHeaders, Cookie: attackerBrowser.header() },
    });
    attackerBrowser.absorb(opened.response);

    const me = await call(getMe, { headers: { ...defaultHeaders, Cookie: attackerBrowser.header() } });
    expect(me.data).toMatchObject({ user: { email: planted } });
    expect(me.data).not.toMatchObject({ user: { id: victim.id } });
  });
});
