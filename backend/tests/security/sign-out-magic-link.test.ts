import { confirmMagicLink, getPendingMagicLink, getTokenData, invokeToken, revokeMySessions, signOut } from 'sdk';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it } from 'vitest';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { defaultHeaders } from '../fixtures';
import { authCookie, cookieChange, cookiesAfter, createTestUser, expectRefusal, insertTestToken, sessionRow, tokenRow } from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';
import { insertSession, sessionSetBy } from './session-helpers';

setTestConfig({ enabledAuthStrategies: ['magic', 'passkey'] });

afterEach(async () => await clearSecurityTestData());

/** An unopened magic link for `user`, and the marker cookie of the browser that asked for it. */
const requestedMagicLink = async (user: { id: string; email: string }) => {
  const { raw, row } = await insertTestToken('magic', user);
  return { raw, row, requestedHere: authCookie('magic-requested', row.id) };
};

/**
 * An opened magic link lets the browser that holds its single-use cookie back in for the rest of its window, without
 * any other proof. On a shared computer that browser serves the next person too, so signing out spends the link, and
 * so does ending that session from another device.
 */
describe('Sign-out after a magic-link sign-in', async () => {
  const call = await createAppClient();

  const openLink = (raw: string, cookie: string) =>
    call(invokeToken, { path: { type: 'magic', token: raw }, headers: { ...defaultHeaders, Cookie: cookie } });

  it("must not sign the next person in as the owner via the owner's opened magic link after sign-out", async () => {
    const owner = await createTestUser(`shared-computer-${nanoid(6)}@security-test.com`.toLowerCase());
    const { raw, row, requestedHere } = await requestedMagicLink(owner);

    const opened = await openLink(raw, requestedHere);
    expect(opened.response.status).toBe(302);
    expect(cookieChange(opened.response, 'session')).toBe('set');
    let ownerBrowser = cookiesAfter(requestedHere, opened.response);

    // Positive control: until the owner signs out, the browser holding the link's cookie gets back in with it.
    const reopenedBefore = await openLink(raw, ownerBrowser);
    expect(reopenedBefore.response.status).toBe(302);
    expect(cookieChange(reopenedBefore.response, 'session')).toBe('set');
    ownerBrowser = cookiesAfter(ownerBrowser, reopenedBefore.response);

    const signedOut = await call(signOut, { headers: { ...defaultHeaders, Cookie: ownerBrowser } });
    expect(signedOut.response.status).toBe(204);
    expect(cookieChange(signedOut.response, 'magic')).toBe('cleared');
    expect(await tokenRow(row.id)).toBeUndefined();

    // The next person reopens the link from the history, even with the single-use cookie as it was before sign-out.
    const withoutSession = ownerBrowser
      .split('; ')
      .filter((pair) => !pair.startsWith(`${authCookieName('session')}=`))
      .join('; ');
    const reopened = await openLink(raw, withoutSession);
    await expectRefusal(reopened, 401, 'magic_not_found');
    expect(cookieChange(reopened.response, 'session')).not.toBe('set');
  });

  it('must not leave the opened magic link usable via a sign-out whose session already ended', async () => {
    const owner = await createTestUser(`ended-session-${nanoid(6)}@security-test.com`.toLowerCase());
    const { raw, row, requestedHere } = await requestedMagicLink(owner);

    const opened = await openLink(raw, requestedHere);
    const ownerBrowser = cookiesAfter(requestedHere, opened.response);
    // The session ends elsewhere first, so this sign-out has no session left to end.
    const session = ownerBrowser.split('; ').find((pair) => pair.startsWith(`${authCookieName('session')}=`));
    expect(session).toBeDefined();
    await call(signOut, { headers: { ...defaultHeaders, Cookie: session! } });

    const signedOut = await call(signOut, { headers: { ...defaultHeaders, Cookie: ownerBrowser } });
    expect(signedOut.response.status).toBe(401);
    expect(cookieChange(signedOut.response, 'magic')).toBe('cleared');
    expect(await tokenRow(row.id)).toBeUndefined();

    const reopened = await openLink(raw, ownerBrowser);
    expect(reopened.response.status).toBe(401);
    expect(cookieChange(reopened.response, 'session')).not.toBe('set');
  });

  it('must not sign a browser in again from a magic link whose session was revoked', async () => {
    const owner = await createTestUser(`revoked-elsewhere-${nanoid(6)}@security-test.com`.toLowerCase());
    const { raw, row, requestedHere } = await requestedMagicLink(owner);

    // A shared computer opens the link; within its window the owner ends that session from the phone.
    const opened = await openLink(raw, requestedHere);
    expect(opened.response.status).toBe(302);
    const sharedBrowser = cookiesAfter(requestedHere, opened.response);
    const sharedSession = await sessionSetBy(opened.response);
    const phone = await insertSession(owner);
    const revoked = await call(revokeMySessions, { body: { ids: [sharedSession.id] }, headers: phone.headers });
    expect(revoked.response.status).toBe(200);
    expect(await sessionRow(sharedSession.id)).toMatchObject({ revocationReason: 'other_session' });
    expect(await tokenRow(row.id)).toBeUndefined();

    // The next person reopens the link from the history, with the single-use cookie and the ended session cookie.
    const reopened = await openLink(raw, sharedBrowser);
    await expectRefusal(reopened, 401, 'magic_not_found');
    expect(cookieChange(reopened.response, 'session')).not.toBe('set');
  });

  it('must not sign the next person in as the owner via a magic link held for confirmation at sign-out', async () => {
    const owner = await createTestUser(`held-link-${nanoid(6)}@security-test.com`.toLowerCase());
    const { raw, row } = await requestedMagicLink(owner);

    // Opened in a browser that never asked for it: the link waits there for its holder to confirm.
    const held = await openLink(raw, '');
    expect(held.response.status).toBe(302);
    expect(held.response.headers.get('location')).toContain('/auth/confirm-sign-in');
    const heldCookie = cookiesAfter('', held.response);
    const pending = () => call(getPendingMagicLink, { headers: { ...defaultHeaders, Cookie: heldCookie } });
    expect((await pending()).response.status).toBe(200);

    // The owner signs in another way in this browser, and later signs out.
    const session = await insertSession(owner);
    const signedOut = await call(signOut, { headers: { ...defaultHeaders, Cookie: `${heldCookie}; ${session.cookie}` } });
    expect(signedOut.response.status).toBe(204);
    expect(cookieChange(signedOut.response, 'magic-pending')).toBe('cleared');
    expect(await tokenRow(row.id)).toBeUndefined();

    // The next person: the confirmation page, even with the held cookie as it was, and the link from the history.
    expect((await pending()).response.status).toBe(401);
    const confirmed = await call(confirmMagicLink, { headers: { ...defaultHeaders, Cookie: heldCookie } });
    expect(confirmed.response.status).toBe(401);
    expect(cookieChange(confirmed.response, 'session')).not.toBe('set');
    const reopened = await openLink(raw, '');
    await expectRefusal(reopened, 401, 'magic_not_found');
  });

  it("spends only this browser's link: another browser's opened link keeps working (positive control)", async () => {
    const [owner, other] = [
      await createTestUser(`owner-${nanoid(6)}@security-test.com`.toLowerCase()),
      await createTestUser(`other-${nanoid(6)}@security-test.com`.toLowerCase()),
    ];
    const ownerLink = await requestedMagicLink(owner);
    const otherLink = await requestedMagicLink(other);

    const ownerBrowser = cookiesAfter(ownerLink.requestedHere, (await openLink(ownerLink.raw, ownerLink.requestedHere)).response);
    const otherBrowser = cookiesAfter(otherLink.requestedHere, (await openLink(otherLink.raw, otherLink.requestedHere)).response);

    expect((await call(signOut, { headers: { ...defaultHeaders, Cookie: ownerBrowser } })).response.status).toBe(204);

    expect(await tokenRow(otherLink.row.id)).toBeDefined();
    const reopened = await openLink(otherLink.raw, otherBrowser);
    expect(reopened.response.status).toBe(302);
    expect(reopened.response.headers.get('location')?.startsWith(appConfig.frontendUrl)).toBe(true);
  });
});

/** An opened invitation names its address, organization and inviter to the browser holding its single-use cookie. */
describe('Sign-out after opening an invitation', async () => {
  const call = await createAppClient();

  it('must delete the invitation cookie at sign-out', async () => {
    const user = await createTestUser(`invitee-${nanoid(6)}@security-test.com`.toLowerCase());
    const singleUse = nanoid(40);
    const { row } = await insertTestToken('invitation', { email: user.email }, { openedWith: singleUse });
    const session = await insertSession(user);
    const browser = `${session.cookie}; ${authCookie('invitation', singleUse)}`;
    const readInvitation = (cookie: string) =>
      call(getTokenData, { path: { type: 'invitation', id: row.id }, headers: { ...defaultHeaders, Cookie: cookie } });

    // Positive control: until sign-out this browser reads the invitation.
    const before = await readInvitation(browser);
    expect(before.response.status).toBe(200);
    expect(before.data).toMatchObject({ email: user.email });

    const signedOut = await call(signOut, { headers: { ...defaultHeaders, Cookie: browser } });
    expect(signedOut.response.status).toBe(204);
    expect(cookieChange(signedOut.response, 'invitation')).toBe('cleared');

    // The next person at the browser holds no cookie that opens it.
    await expectRefusal(await readInvitation(cookiesAfter(browser, signedOut.response)), 401, 'invitation_not_found');
  });
});
