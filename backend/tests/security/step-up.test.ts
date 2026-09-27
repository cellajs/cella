import { decodeBase32 } from '@oslojs/encoding';
import { and, eq } from 'drizzle-orm';
import { getMe, getStepUp, getStepUpPasskeyChallenge, invokeToken, sendStepUpLink, stepUp } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { tokensTable } from '#/modules/auth/tokens-db';
import { generateTOTP } from '#/modules/auth/totps/helpers/totp-core';
import { defaultHeaders } from '../fixtures';
import {
  authCookie,
  cookieChange,
  cookiesAfter,
  createMfaToken,
  createSystemAdminUser,
  createTestUser,
  createTotpUser,
  expectRefusal,
  sessionRow,
} from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, insertPasskey, issuedChallenge, passkeyChallenge } from './helpers';
import {
  askStepUpLink,
  insertImpersonation,
  insertSession,
  insertStaleSession,
  openStepUpLink,
  type TestSession,
} from './session-helpers';

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp', 'magic'] });

afterEach(async () => await clearSecurityTestData());

/** The Base32 secret `createTotpUser` stores. */
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const currentCode = () =>
  generateTOTP(decodeBase32(TOTP_SECRET), appConfig.totp.intervalInSeconds, appConfig.totp.digits);
const wrongCode = () => currentCode().replace(/^./, (digit) => String((Number(digit) + 5) % 10));

/**
 * A step-up proves the user is present on one session again: with a factor they hold, or, holding none, through an
 * emailed link opened in the browser that asked. It stamps that session only, never an impersonation, and signs
 * nobody in.
 */
describe('step-up', async () => {
  const call = await createAppClient();

  const stateOf = async (session: TestSession) =>
    (await call(getStepUp, { headers: session.headers })).data as { steppedUp: boolean; methods: string[] };

  /** A user holding a registered software passkey, with a session signed in before the window. */
  const passkeyHolder = async (label: string) => {
    const user = await createTestUser(`${label}@security-test.com`);
    return { user, passkey: await insertPasskey(user), session: await insertStaleSession(user) };
  };

  it('must not step up a session via a passkey response to a sign-in or MFA challenge', async () => {
    const { user, passkey, session } = await passkeyHolder('passkey-step-up');
    const challengeCookies = { authentication: '', mfa: authCookie('confirm-mfa', await createMfaToken(user)) };

    for (const [type, cookie] of Object.entries(challengeCookies) as ['authentication' | 'mfa', string][]) {
      const issued = await passkeyChallenge(type, cookie);
      const { error, response } = await call(stepUp, {
        body: { passkeyData: passkey.assert(issued.challenge) },
        headers: { ...defaultHeaders, Cookie: `${session.cookie}; ${issued.cookie}` },
      });
      await expectRefusal({ response, error }, 401, 'passkey_verification_failed');
    }
    expect((await sessionRow(session.id)).steppedUpAt).toBeNull();

    // Positive control: a step-up challenge issued to this session's user.
    const issued = issuedChallenge(await call(getStepUpPasskeyChallenge, { headers: session.headers }));
    const { response } = await call(stepUp, {
      body: { passkeyData: passkey.assert(issued.challenge) },
      headers: { ...defaultHeaders, Cookie: `${session.cookie}; ${issued.cookie}` },
    });
    expect(response.status).toBe(204);
    expect(await sessionRow(session.id)).toMatchObject({ steppedUpVia: 'passkey' });
  });

  it('must not step up a session via a wrong authenticator code', async () => {
    const user = await createTotpUser('totp-step-up@security-test.com');
    const session = await insertStaleSession(user);
    expect(await stateOf(session)).toEqual({ steppedUp: false, methods: ['totp'] });

    const { error, response } = await call(stepUp, { body: { totpCode: wrongCode() }, headers: session.headers });
    await expectRefusal({ response, error }, 401, 'invalid_token');
    expect((await sessionRow(session.id)).steppedUpAt).toBeNull();

    expect((await call(stepUp, { body: { totpCode: currentCode() }, headers: session.headers })).response.status).toBe(
      204,
    );
    expect(await sessionRow(session.id)).toMatchObject({ steppedUpVia: 'totp' });
    expect(await stateOf(session)).toEqual({ steppedUp: true, methods: ['totp'] });
  });

  it('must not step up an impersonation session via a factor or an emailed link', async () => {
    const admin = await createSystemAdminUser('step-up-admin@security-test.com');
    const target = await createTotpUser('step-up-target@security-test.com');
    const impersonation = await insertImpersonation(await insertSession(admin), target);

    const viaFactor = await call(stepUp, { body: { totpCode: currentCode() }, headers: impersonation.headers });
    await expectRefusal(viaFactor, 403, 'impersonation_forbidden');
    const viaLink = await call(sendStepUpLink, { body: {}, headers: impersonation.headers });
    expect(viaLink.response.status).toBe(403);
    const viaPasskey = await call(getStepUpPasskeyChallenge, { headers: impersonation.headers });
    expect(viaPasskey.response.status).toBe(403);
    expect(await stateOf(impersonation)).toEqual({ steppedUp: false, methods: [] });
    expect((await sessionRow(impersonation.id)).steppedUpAt).toBeNull();
    expect(vi.mocked(mailer.prepareEmails)).not.toHaveBeenCalled();
  });

  it('must not step up via an emailed link a user with a second factor asks for', async () => {
    const user = await createTotpUser('factor-holder@security-test.com');
    const session = await insertStaleSession(user);

    const { error, response } = await call(sendStepUpLink, { body: {}, headers: session.headers });
    await expectRefusal({ response, error }, 400, 'invalid_request');
    expect(vi.mocked(mailer.prepareEmails)).not.toHaveBeenCalled();
  });

  it('offers the emailed link to a user without a second factor while other accounts hold factors (positive control)', async () => {
    await passkeyHolder('passkey-elsewhere');
    await createTotpUser('totp-elsewhere@security-test.com');
    const user = await createTestUser('no-factor@security-test.com');
    const session = await insertStaleSession(user);

    // Only the user's own factors count: other accounts' passkeys and authenticator apps are not the user's to prove.
    expect(await stateOf(session)).toEqual({ steppedUp: false, methods: ['email', 'sign_in'] });
    expect((await call(sendStepUpLink, { body: {}, headers: session.headers })).response.status).toBe(204);
    expect(vi.mocked(mailer.prepareEmails)).toHaveBeenCalledOnce();
  });

  describe('emailed link', () => {
    const stepUpTokens = (userId: string) =>
      db
        .select()
        .from(tokensTable)
        .where(and(eq(tokensTable.type, 'step-up'), eq(tokensTable.userId, userId)));

    it('must not stamp the session via the emailed link opened in another browser', async () => {
      const user = await createTestUser('link-elsewhere@security-test.com');
      const asking = await insertStaleSession(user);
      const otherBrowser = await insertStaleSession(user);
      const { browser, rawToken } = await askStepUpLink(asking, '/account');

      const elsewhere = await call(invokeToken, {
        path: { type: 'step-up', token: rawToken },
        headers: otherBrowser.headers,
      });
      await expectRefusal(elsewhere, 403, 'step_up_other_browser');
      expect((await sessionRow(asking.id)).steppedUpAt).toBeNull();
      expect((await sessionRow(otherBrowser.id)).steppedUpAt).toBeNull();
      // Refused before redemption, so the browser that asked can still open it.
      expect((await stepUpTokens(user.id))[0]?.invokedAt).toBeNull();

      const opened = await openStepUpLink(rawToken, browser);
      expect(opened.response.status).toBe(302);
      expect(await sessionRow(asking.id)).toMatchObject({ steppedUpVia: 'email' });
      expect((await sessionRow(otherBrowser.id)).steppedUpAt).toBeNull();
    });

    it('must not sign anybody in via the emailed link', async () => {
      const user = await createTestUser('link-no-sign-in@security-test.com');
      const asking = await insertStaleSession(user);
      const { browser, rawToken } = await askStepUpLink(asking, '/account');

      const opened = await openStepUpLink(rawToken, browser);

      expect(opened.response.status).toBe(302);
      expect(new URL(opened.response.headers.get('location') ?? '').pathname).toBe('/account');
      expect(cookieChange(opened.response, 'session')).not.toBe('set');
      // The browser that asked is stepped up on its own session; the link opens once.
      expect(await stateOf({ ...asking, headers: { ...defaultHeaders, Cookie: browser } })).toEqual({
        steppedUp: true,
        methods: ['email', 'sign_in'],
      });
      expect((await call(getMe, { headers: { ...defaultHeaders, Cookie: browser } })).response.status).toBe(200);
      expect((await openStepUpLink(rawToken, cookiesAfter(browser, opened.response))).response.status).toBe(403);
    });
  });
});
