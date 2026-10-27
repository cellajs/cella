import { getStepUp, getStepUpPasskeyChallenge, sendStepUpCode, stepUp } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mailer } from '#/lib/mailer';
import { stepUpEmail } from '../../emails';
import { defaultHeaders } from '../fixtures';
import {
  authCookie,
  createMfaToken,
  createSystemAdminUser,
  createTestUser,
  createTotpUser,
  expectRefusal,
  sessionRow,
  totpCode,
  wrongTotpCode,
} from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, insertPasskey, issuedChallenge, passkeyChallenge } from './helpers';
import { askStepUpCode, insertImpersonation, insertSession, insertStaleSession, type TestSession } from './session-helpers';

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp', 'magic'] });

afterEach(async () => await clearSecurityTestData());

type Tier = 'factor' | 'account' | 'enroll';

/**
 * A step-up proves the user is present on one session again: with a factor they hold, or with a code mailed for that
 * session. It stamps that session only, never an impersonation, and signs nobody in.
 */
describe('step-up', async () => {
  const call = await createAppClient();

  const stateOf = async (session: TestSession, tier: Tier = 'account') =>
    (await call(getStepUp, { query: { tier }, headers: session.headers })).data as { steppedUp: boolean; methods: string[] };

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

    const { error, response } = await call(stepUp, { body: { totpCode: wrongTotpCode() }, headers: session.headers });
    await expectRefusal({ response, error }, 401, 'invalid_token');
    expect((await sessionRow(session.id)).steppedUpAt).toBeNull();

    expect((await call(stepUp, { body: { totpCode: totpCode() }, headers: session.headers })).response.status).toBe(204);
    expect(await sessionRow(session.id)).toMatchObject({ steppedUpVia: 'totp' });
    expect(await stateOf(session)).toEqual({ steppedUp: true, methods: ['totp'] });
  });

  it('must not step up an impersonation session via a factor or an emailed code', async () => {
    const admin = await createSystemAdminUser('step-up-admin@security-test.com');
    const target = await createTotpUser('step-up-target@security-test.com');
    const impersonation = await insertImpersonation(await insertSession(admin), target);

    const viaFactor = await call(stepUp, { body: { totpCode: totpCode() }, headers: impersonation.headers });
    await expectRefusal(viaFactor, 403, 'impersonation_forbidden');
    const viaMail = await call(sendStepUpCode, { headers: impersonation.headers });
    expect(viaMail.response.status).toBe(403);
    const viaPasskey = await call(getStepUpPasskeyChallenge, { headers: impersonation.headers });
    expect(viaPasskey.response.status).toBe(403);
    expect(await stateOf(impersonation)).toEqual({ steppedUp: false, methods: [] });
    expect((await sessionRow(impersonation.id)).steppedUpAt).toBeNull();
    expect(vi.mocked(mailer.sendEmails)).not.toHaveBeenCalled();
  });

  it('offers the emailed code to a user without a second factor while other accounts hold factors (positive control)', async () => {
    await passkeyHolder('passkey-elsewhere');
    await createTotpUser('totp-elsewhere@security-test.com');
    const user = await createTestUser('no-factor@security-test.com');
    const session = await insertStaleSession(user);

    // Only the user's own factors count: other accounts' passkeys and authenticator apps are not the user's to prove.
    expect(await stateOf(session)).toEqual({ steppedUp: false, methods: ['email'] });
    expect(await stateOf(session, 'factor')).toEqual({ steppedUp: false, methods: ['enroll'] });
    await askStepUpCode(session);
    expect(vi.mocked(mailer.sendEmails)).toHaveBeenCalledOnce();
  });

  it('must not step up a session via the code mailed to another session, nor via a code used already', async () => {
    const user = await createTestUser('code-elsewhere@security-test.com');
    const [asking, other] = [await insertStaleSession(user), await insertStaleSession(user)];
    const code = await askStepUpCode(asking);

    const elsewhere = await call(stepUp, { body: { emailCode: code }, headers: other.headers });
    await expectRefusal(elsewhere, 401, 'invalid_credentials');
    expect((await sessionRow(other.id)).steppedUpAt).toBeNull();

    expect((await call(stepUp, { body: { emailCode: code }, headers: asking.headers })).response.status).toBe(204);
    expect(await sessionRow(asking.id)).toMatchObject({ steppedUpVia: 'email' });
    expect(await stateOf(asking)).toEqual({ steppedUp: true, methods: ['email'] });

    // The code opened its step-up and is gone.
    await expectRefusal(await call(stepUp, { body: { emailCode: code }, headers: asking.headers }), 401, 'invalid_credentials');
  });

  it('must not put the code where a lock screen or a mail list shows it', () => {
    const { subject, previewText } = stepUpEmail.translate('en', { code: '482913', name: 'Emily', browser: 'Firefox', os: 'macOS' });
    expect(`${subject} ${previewText}`).not.toContain('482913');
  });

  it('offers a user who holds a factor, with MFA off, a new factor through the emailed code', async () => {
    const { session } = await passkeyHolder('lost-passkey');

    expect(await stateOf(session, 'factor')).toEqual({ steppedUp: false, methods: ['passkey', 'enroll'] });
    expect(await stateOf(session, 'enroll')).toEqual({ steppedUp: false, methods: ['passkey', 'email'] });
  });

  it('must not mail a code to a user with MFA on', async () => {
    const user = await createTotpUser('mfa-on@security-test.com');
    const session = await insertStaleSession(user);

    await expectRefusal(await call(sendStepUpCode, { headers: session.headers }), 400, 'invalid_request');
    await expectRefusal(await call(stepUp, { body: { emailCode: '123456' }, headers: session.headers }), 400, 'invalid_request');
    expect(vi.mocked(mailer.sendEmails)).not.toHaveBeenCalled();
  });
});
