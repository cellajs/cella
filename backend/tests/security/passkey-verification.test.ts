import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { generatePasskeyChallenge, signInWithPasskey, toggleMfa } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders } from '../fixtures';
import { createTestSession, createUser, type ErrorResponse } from '../helpers';
import { softwarePasskey } from '../software-passkey';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

type Passkey = ReturnType<typeof softwarePasskey>;
type Assertion = ReturnType<Passkey['assert']>;

/**
 * A passkey response that does not verify is a failed sign-in: 401, no session. Answering 500 (the library throws for
 * most mismatches) also kept the failure out of the sign-in limiter, which counts only 401, 403 and 404.
 */
describe('Passkey verification', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  async function userWithPasskey() {
    const email = `passkey-${nanoid(8)}@security-test.com`;
    const user = await createUser(email);
    const passkey = softwarePasskey();
    await db.insert(passkeysTable).values({
      userId: user.id,
      credentialId: passkey.credentialId,
      publicKey: passkey.publicKey,
      counter: 0,
      nameOnDevice: 'Test device',
      deviceType: 'desktop',
    });
    return { user, passkey };
  }

  /** A fresh challenge and the cookie that carries it, as the sign-in page gets them. */
  async function challengeFor() {
    const { data, response } = await call(generatePasskeyChallenge, {
      body: { type: 'authentication' },
      headers: defaultHeaders,
    });
    const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(cookie).toContain(authCookieName('passkey-challenge'));
    return { challenge: (data as { challenge: string }).challenge, cookie };
  }

  const signIn = (assertion: Assertion, cookie: string) =>
    call(signInWithPasskey, {
      body: { type: 'authentication', assertion },
      headers: { ...defaultHeaders, Cookie: cookie },
    });

  const sessionsOf = (userId: string) => db.select().from(sessionsTable).where(eq(sessionsTable.userId, userId));

  const forgeries: [string, (passkey: Passkey, challenge: string) => Assertion][] = [
    ['a response to another challenge', (passkey) => passkey.assert(nanoid(43))],
    [
      'a response for another origin',
      (passkey, challenge) => passkey.assert(challenge, { origin: 'https://evil.example' }),
    ],
    [
      'a response for another relying party',
      (passkey, challenge) => passkey.assert(challenge, { rpId: 'evil.example' }),
    ],
    ['a response without user verification', (passkey, challenge) => passkey.assert(challenge, { flags: 0x01 })],
    [
      'a signature from another key',
      (passkey, challenge) => ({
        ...softwarePasskey().assert(challenge),
        id: passkey.credentialId,
        rawId: passkey.credentialId,
      }),
    ],
  ];

  for (const [vector, forge] of forgeries) {
    it(`must not sign in via ${vector}`, async () => {
      const { user, passkey } = await userWithPasskey();
      const { challenge, cookie } = await challengeFor();

      const { error, response } = await signIn(forge(passkey, challenge), cookie);
      expect(response.status).toBe(401);
      expect((error as ErrorResponse).type).toBe('passkey_verification_failed');
      expect(response.headers.get('set-cookie') ?? '').not.toContain(authCookieName('session'));
      expect(await sessionsOf(user.id)).toHaveLength(0);
    });
  }

  it('must not switch MFA off via a passkey response to another challenge', async () => {
    const { user, passkey } = await userWithPasskey();
    await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, user.id));
    const { cookie } = await challengeFor();
    const sessionCookie = await createTestSession(user);

    const { error, response } = await call(toggleMfa, {
      body: { mfaRequired: false, passkeyData: passkey.assert(nanoid(43)) },
      headers: { ...defaultHeaders, Cookie: `${sessionCookie}; ${cookie}` },
    });
    expect(response.status).toBe(401);
    expect((error as ErrorResponse).type).toBe('passkey_verification_failed');
    const [row] = await db
      .select({ mfaRequired: usersTable.mfaRequired })
      .from(usersTable)
      .where(eq(usersTable.id, user.id));
    expect(row?.mfaRequired).toBe(true);
  });

  it('signs in with a valid response from the registered passkey (positive control)', async () => {
    const { user, passkey } = await userWithPasskey();
    const { challenge, cookie } = await challengeFor();

    const { response } = await signIn(passkey.assert(challenge), cookie);
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain(authCookieName('session'));
    expect(await sessionsOf(user.id)).toHaveLength(1);
    const [stored] = await db.select().from(passkeysTable).where(eq(passkeysTable.userId, user.id));
    expect(stored?.counter).toBe(1);
  });
});
