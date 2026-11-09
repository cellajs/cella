import { and, eq } from 'drizzle-orm';
import { generateStepUpPasskeyChallenge, getStepUp, revokeMySessions, sendStepUpCode, stepUp } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { tokensTable } from '#/modules/auth/tokens/tokens-db';
import { mockUser } from '#/modules/user/user-mocks';
import { insertUsers } from '#/modules/user/user-queries';
import { stepUpEmail } from '../../emails';
import { defaultHeaders } from '../fixtures';
import {
  authCookie,
  createMfaToken,
  createTestUser,
  createTotpUser,
  expectRefusal,
  sentMails,
  sessionRow,
  tokenRowOf,
  totpCode,
  wrongTotpCode,
} from '../helpers';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, insertPasskey, issuedChallenge, passkeyChallenge } from './helpers';
import { askStepUpCode, asSession, insertStaleSession, keepCookiesOf, type TestSession } from './session-helpers';

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp', 'magic'] });

afterEach(async () => await clearSecurityTestData());

type Tier = 'factor' | 'account' | 'enroll';

/**
 * A step-up proves the user is present on one session again: with a factor they hold, or with a code mailed for that
 * session. It stamps that session only, and signs nobody in.
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

  it('offers an account without a proven address nothing by mail, so it can neither step up nor enroll', async () => {
    const [user] = await insertUsers({ var: { db } }, { users: [mockUser({ email: `provisional-${nanoid(6)}@security-test.com` })] });
    const session = await insertStaleSession(user);

    for (const tier of ['account', 'enroll', 'factor'] as const) expect((await stateOf(session, tier)).methods).toEqual([]);
    await expectRefusal(await call(sendStepUpCode, { headers: session.headers }), 400, 'invalid_request');
    expect(sentMails()).toHaveLength(0);
  });

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
    const issued = issuedChallenge(await call(generateStepUpPasskeyChallenge, { headers: session.headers }));
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

    const stepped = await call(stepUp, { body: { totpCode: totpCode() }, headers: session.headers });
    expect(stepped.response.status).toBe(204);
    expect(await sessionRow(session.id)).toMatchObject({ steppedUpVia: 'totp' });
    expect(await stateOf(keepCookiesOf(session, stepped.response))).toEqual({ steppedUp: true, methods: ['totp'] });
  });

  it('must not step up a copy of the session cookie made before the step-up', async () => {
    const user = await createTotpUser('copied-before-step-up@security-test.com');
    const [owner, otherDevice] = [await insertStaleSession(user), await insertStaleSession(user)];
    // The copy an infostealer or a synced profile took: the session cookie as the owner's browser held it then.
    const copy = asSession(owner.id, owner.cookie);
    const endOtherDevice = (session: TestSession) => call(revokeMySessions, { body: { ids: [otherDevice.id] }, headers: session.headers });

    const { response } = await call(stepUp, { body: { totpCode: totpCode() }, headers: owner.headers });
    expect(response.status).toBe(204);
    keepCookiesOf(owner, response);

    // The copy names the stamped session row but lacks the step-up cookie the stamp went out with.
    expect(await stateOf(copy)).toEqual({ steppedUp: false, methods: ['totp'] });
    await expectRefusal(await endOtherDevice(copy), 403, 'step_up_required');
    expect((await sessionRow(otherDevice.id)).revokedAt).toBeNull();

    // Positive control: the owner's browser holds the step-up cookie and passes the guard.
    expect((await endOtherDevice(owner)).response.status).toBe(200);
    expect(await sessionRow(otherDevice.id)).toMatchObject({ revocationReason: 'other_session' });
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

    const stepped = await call(stepUp, { body: { emailCode: code }, headers: asking.headers });
    expect(stepped.response.status).toBe(204);
    expect(await sessionRow(asking.id)).toMatchObject({ steppedUpVia: 'email' });
    expect(await stateOf(keepCookiesOf(asking, stepped.response))).toEqual({ steppedUp: true, methods: ['email'] });

    // The code opened its step-up and is gone.
    await expectRefusal(await call(stepUp, { body: { emailCode: code }, headers: asking.headers }), 401, 'invalid_credentials');
  });

  it('must leave one live step-up code after concurrent requests', async () => {
    const user = await createTestUser('code-burst@security-test.com');
    const session = await insertStaleSession(user);

    // Ten at once: requests whose deletes all run before the others' inserts each try to store a code.
    const answers = await Promise.all(Array.from({ length: 10 }, () => call(sendStepUpCode, { headers: session.headers })));
    const sent = answers.filter(({ response }) => response.status === 204);
    for (const refused of answers.filter(({ response }) => response.status !== 204)) await expectRefusal(refused, 409, 'resource_already_exists');

    const codes = await db
      .select()
      .from(tokensTable)
      .where(and(eq(tokensTable.kind, 'step-up'), eq(tokensTable.sessionId, session.id)));
    expect(codes).toHaveLength(1);
    // A refused request mails nothing, and of the mailed codes only the stored one is live.
    const mailed = sentMails().map(({ statics }) => String(statics.code));
    expect(mailed).toHaveLength(sent.length);
    const stored = await Promise.all(mailed.map((code) => tokenRowOf('step-up', code)));
    const live = mailed.filter((_, index) => stored[index]);
    expect(live).toHaveLength(1);

    expect((await call(stepUp, { body: { emailCode: live[0] }, headers: session.headers })).response.status).toBe(204);
  });

  it('must not put the code where a lock screen or a mail list shows it', () => {
    const { subject, previewText } = stepUpEmail.translate('en', { code: '482913', name: 'Emily' });
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
