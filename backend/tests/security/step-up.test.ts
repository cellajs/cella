import { decodeBase32 } from '@oslojs/encoding';
import { and, eq } from 'drizzle-orm';
import {
  generatePasskeyChallenge,
  getMe,
  getStepUp,
  getStepUpPasskeyChallenge,
  invokeToken,
  sendStepUpLink,
  stepUp,
} from 'sdk';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { generateTOTP } from '#/modules/auth/totps/helpers/totp-core';
import { defaultHeaders } from '../fixtures';
import {
  authCookie,
  createMfaToken,
  createSystemAdminUser,
  createTestUser,
  createTotpUser,
  type ErrorResponse,
} from '../helpers';
import { softwarePasskey } from '../software-passkey';
import { createAppClient, type TestResult } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';
import { cookiesAfter, insertImpersonation, insertSession, sessionRow, type TestSession } from './session-helpers';

vi.mock('#/lib/mailer', () => ({ mailer: { prepareEmails: vi.fn().mockResolvedValue(undefined) } }));

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp', 'magic'] });

beforeAll(() => mockFetchRequest());

afterEach(async () => {
  await clearSecurityTestData();
  vi.clearAllMocks();
});

/** The Base32 secret `createTotpUser` stores. */
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const currentCode = () =>
  generateTOTP(decodeBase32(TOTP_SECRET), appConfig.totp.intervalInSeconds, appConfig.totp.digits);
const wrongCode = () => currentCode().replace(/^./, (digit) => String((Number(digit) + 5) % 10));

/** Signed in longer ago than the step-up window. */
const STALE = { ageMs: 60 * 60 * 1000 };

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
    const passkey = softwarePasskey();
    await db.insert(passkeysTable).values({
      userId: user.id,
      credentialId: passkey.credentialId,
      publicKey: passkey.publicKey,
      counter: 0,
      nameOnDevice: 'Test device',
      deviceType: 'desktop',
    });
    return { user, passkey, session: await insertSession(user, STALE) };
  };

  /** The challenge a response issued, and the cookie pair that carries it. */
  const issuedChallenge = (result: TestResult) => {
    expect(result.response.status).toBe(200);
    const pair = result.response.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .find((value) => value.startsWith(`${authCookieName('passkey-challenge')}=`));
    return { challenge: (result.data as { challenge: string }).challenge, cookie: pair ?? '' };
  };

  it('must not step up a session via a passkey response to a sign-in or MFA challenge', async () => {
    const { user, passkey, session } = await passkeyHolder('passkey-step-up');
    const challengeCookies = { authentication: '', mfa: authCookie('confirm-mfa', await createMfaToken(user)) };

    for (const [type, cookie] of Object.entries(challengeCookies) as ['authentication' | 'mfa', string][]) {
      const issued = issuedChallenge(
        await call(generatePasskeyChallenge, { body: { type }, headers: { ...defaultHeaders, Cookie: cookie } }),
      );
      const { error, response } = await call(stepUp, {
        body: { passkeyData: passkey.assert(issued.challenge) },
        headers: { ...defaultHeaders, Cookie: `${session.cookie}; ${issued.cookie}` },
      });
      expect(response.status).toBe(401);
      expect((error as ErrorResponse).type).toBe('passkey_verification_failed');
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
    const session = await insertSession(user, STALE);
    expect(await stateOf(session)).toEqual({ steppedUp: false, methods: ['totp'] });

    const { error, response } = await call(stepUp, { body: { totpCode: wrongCode() }, headers: session.headers });
    expect(response.status).toBe(401);
    expect((error as ErrorResponse).type).toBe('invalid_token');
    expect((await sessionRow(session.id)).steppedUpAt).toBeNull();

    expect((await call(stepUp, { body: { totpCode: currentCode() }, headers: session.headers })).response.status).toBe(
      204,
    );
    expect(await sessionRow(session.id)).toMatchObject({ steppedUpVia: 'totp' });
    expect(await stateOf(session)).toEqual({ steppedUp: true, methods: ['totp'] });
  });

  it("must not step up a session via a step-up of the user's other session", async () => {
    const user = await createTotpUser('two-sessions@security-test.com');
    const [stepped, other] = [await insertSession(user, STALE), await insertSession(user, STALE)];

    await call(stepUp, { body: { totpCode: currentCode() }, headers: stepped.headers });

    expect((await stateOf(stepped)).steppedUp).toBe(true);
    expect((await stateOf(other)).steppedUp).toBe(false);
  });

  it('must not step up an impersonation session via a factor or an emailed link', async () => {
    const admin = await createSystemAdminUser('step-up-admin@security-test.com');
    const target = await createTotpUser('step-up-target@security-test.com');
    const impersonation = await insertImpersonation(await insertSession(admin), target);

    const viaFactor = await call(stepUp, { body: { totpCode: currentCode() }, headers: impersonation.headers });
    expect(viaFactor.response.status).toBe(403);
    expect((viaFactor.error as ErrorResponse).type).toBe('impersonation_forbidden');
    const viaLink = await call(sendStepUpLink, { body: {}, headers: impersonation.headers });
    expect(viaLink.response.status).toBe(403);
    const passkeyChallenge = await call(getStepUpPasskeyChallenge, { headers: impersonation.headers });
    expect(passkeyChallenge.response.status).toBe(403);
    expect(await stateOf(impersonation)).toEqual({ steppedUp: false, methods: [] });
    expect((await sessionRow(impersonation.id)).steppedUpAt).toBeNull();
    expect(vi.mocked(mailer.prepareEmails)).not.toHaveBeenCalled();
  });

  it('must not step up via an emailed link a user with a second factor asks for', async () => {
    const user = await createTotpUser('factor-holder@security-test.com');
    const session = await insertSession(user, STALE);

    const { error, response } = await call(sendStepUpLink, { body: {}, headers: session.headers });
    expect(response.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('invalid_request');
    expect(vi.mocked(mailer.prepareEmails)).not.toHaveBeenCalled();
  });

  it('offers the emailed link to a user without a second factor while other accounts hold factors (positive control)', async () => {
    await passkeyHolder('passkey-elsewhere');
    await createTotpUser('totp-elsewhere@security-test.com');
    const user = await createTestUser('no-factor@security-test.com');
    const session = await insertSession(user, STALE);

    // Only the user's own factors count: other accounts' passkeys and authenticator apps are not the user's to prove.
    expect(await stateOf(session)).toEqual({ steppedUp: false, methods: ['email', 'sign_in'] });
    expect((await call(sendStepUpLink, { body: {}, headers: session.headers })).response.status).toBe(204);
    expect(vi.mocked(mailer.prepareEmails)).toHaveBeenCalledOnce();
  });

  describe('emailed link', () => {
    /** Asks for a link from a signed-in browser; returns the browser's cookies afterwards and the mailed raw token. */
    const askForLink = async (session: TestSession) => {
      const asked = await call(sendStepUpLink, { body: { redirect: '/account' }, headers: session.headers });
      expect(asked.response.status).toBe(204);
      const statics = vi.mocked(mailer.prepareEmails).mock.lastCall?.[1] as { stepUpUrl?: string } | undefined;
      const rawToken = statics?.stepUpUrl?.split('/').at(-1) ?? '';
      expect(rawToken).not.toBe('');
      return { browser: cookiesAfter(session.cookie, asked.response), rawToken };
    };

    /** A click on the mailed link: the mail app starts the navigation, so the Strict session cookie stays home. */
    const openLink = (rawToken: string, cookie: string) => {
      const laxOnly = cookie
        .split('; ')
        .filter((pair) => pair.startsWith(`${authCookieName('step-up-requested')}=`))
        .join('; ');
      return call(invokeToken, {
        path: { type: 'step-up', token: rawToken },
        headers: { ...defaultHeaders, Cookie: laxOnly },
      });
    };

    const stepUpTokens = (userId: string) =>
      db
        .select()
        .from(tokensTable)
        .where(and(eq(tokensTable.type, 'step-up'), eq(tokensTable.userId, userId)));

    it('must not stamp the session via the emailed link opened in another browser', async () => {
      const user = await createTestUser('link-elsewhere@security-test.com');
      const asking = await insertSession(user, STALE);
      const otherBrowser = await insertSession(user, STALE);
      const { browser, rawToken } = await askForLink(asking);

      const elsewhere = await call(invokeToken, {
        path: { type: 'step-up', token: rawToken },
        headers: otherBrowser.headers,
      });
      expect(elsewhere.response.status).toBe(403);
      expect((elsewhere.error as ErrorResponse).type).toBe('step_up_other_browser');
      expect((await sessionRow(asking.id)).steppedUpAt).toBeNull();
      expect((await sessionRow(otherBrowser.id)).steppedUpAt).toBeNull();
      // Refused before redemption, so the browser that asked can still open it.
      expect((await stepUpTokens(user.id))[0]?.invokedAt).toBeNull();

      const opened = await openLink(rawToken, browser);
      expect(opened.response.status).toBe(302);
      expect(await sessionRow(asking.id)).toMatchObject({ steppedUpVia: 'email' });
      expect((await sessionRow(otherBrowser.id)).steppedUpAt).toBeNull();
    });

    it('must not sign anybody in via the emailed link', async () => {
      const user = await createTestUser('link-no-sign-in@security-test.com');
      const asking = await insertSession(user, STALE);
      const { browser, rawToken } = await askForLink(asking);

      const opened = await openLink(rawToken, browser);

      expect(opened.response.status).toBe(302);
      expect(new URL(opened.response.headers.get('location') ?? '').pathname).toBe('/account');
      const sessionCookie = `${authCookieName('session')}=`;
      expect(
        opened.response.headers
          .getSetCookie()
          .filter((line) => line.startsWith(sessionCookie) && !line.startsWith(`${sessionCookie};`)),
      ).toEqual([]);
      // The browser that asked is stepped up on its own session; the link opens once.
      expect(await stateOf({ ...asking, headers: { ...defaultHeaders, Cookie: browser } })).toEqual({
        steppedUp: true,
        methods: ['email', 'sign_in'],
      });
      expect((await call(getMe, { headers: { ...defaultHeaders, Cookie: browser } })).response.status).toBe(200);
      expect((await openLink(rawToken, cookiesAfter(browser, opened.response))).response.status).toBe(403);
    });
  });
});
