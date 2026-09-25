import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createPasskey, generatePasskeyChallenge, signInWithPasskey } from 'sdk';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { usersTable } from '#/modules/user/user-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { authCookie, createMfaToken, createTestSession, createUser, type ErrorResponse } from '../helpers';
import { softwarePasskey } from '../software-passkey';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

/** Runs between a response's verification and the counter write: where a concurrent sign-in would land. */
const hooks = vi.hoisted(() => ({ afterVerify: undefined as (() => Promise<void>) | undefined }));

vi.mock('@simplewebauthn/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simplewebauthn/server')>();
  return {
    ...actual,
    verifyAuthenticationResponse: async (...args: Parameters<typeof actual.verifyAuthenticationResponse>) => {
      const result = await actual.verifyAuthenticationResponse(...args);
      await hooks.afterVerify?.();
      return result;
    },
  };
});

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp'] });

type Passkey = ReturnType<typeof softwarePasskey>;

const sessionsOf = (userId: string) => db.select().from(sessionsTable).where(eq(sessionsTable.userId, userId));
const storedPasskey = async (credentialId: string) =>
  (await db.select().from(passkeysTable).where(eq(passkeysTable.credentialId, credentialId)))[0];

beforeAll(() => mockFetchRequest());

afterEach(async () => {
  hooks.afterVerify = undefined;
  await clearSecurityTestData();
});

/**
 * A passkey challenge answers one ceremony of the kind it was issued for, once. The server keeps it until it is used,
 * so a browser that kept a copy of the challenge cookie gains nothing, and a signature counter only ever moves forward.
 */
describe('Passkey challenges', async () => {
  const call = await createAppClient();

  async function userWithPasskey({ counter = 0, mfaRequired = false } = {}) {
    const user = await createUser(`passkey-${nanoid(8)}@security-test.com`);
    if (mfaRequired) await db.update(usersTable).set({ mfaRequired }).where(eq(usersTable.id, user.id));
    const passkey = softwarePasskey();
    await db.insert(passkeysTable).values({
      userId: user.id,
      credentialId: passkey.credentialId,
      publicKey: passkey.publicKey,
      counter,
      nameOnDevice: 'Test device',
      deviceType: 'desktop',
    });
    return { user, passkey };
  }

  /** A challenge of `type` and the cookie that carries it, as the page gets them. */
  async function challenge(type: 'authentication' | 'mfa' | 'registration', cookie?: string) {
    const { data, response } = await call(generatePasskeyChallenge, {
      body: { type },
      headers: { ...defaultHeaders, ...(cookie ? { Cookie: cookie } : {}) },
    });
    expect(response.status).toBe(200);
    const challengeCookie = response.headers
      .getSetCookie()
      .find((line) => line.startsWith(`${authCookieName('passkey-challenge')}=`))
      ?.split(';')[0];
    if (!challengeCookie) throw new Error('no passkey-challenge cookie');
    return { challenge: (data as { challenge: string }).challenge, challengeCookie };
  }

  const signIn = (
    assertion: ReturnType<Passkey['assert']>,
    cookie: string,
    type: 'authentication' | 'mfa' = 'authentication',
  ) => call(signInWithPasskey, { body: { type, assertion }, headers: { ...defaultHeaders, Cookie: cookie } });

  it('must not sign in twice via a reused passkey challenge', async () => {
    // Synced passkeys report no signature counter (always 0), so only the challenge stops a replay.
    const { user, passkey } = await userWithPasskey();
    const { challenge: value, challengeCookie } = await challenge('authentication');
    const assertion = passkey.assert(value, { counter: 0 });

    const first = await signIn(assertion, challengeCookie);
    expect(first.response.status).toBe(204);

    // The same response with the challenge cookie the browser kept.
    const replay = await signIn(assertion, challengeCookie);
    expect(replay.response.status).toBe(401);
    expect((replay.error as ErrorResponse).type).toBe('passkey_verification_failed');
    expect(replay.response.headers.get('set-cookie') ?? '').not.toContain(authCookieName('session'));
    expect(await sessionsOf(user.id)).toHaveLength(1);

    // Positive control: a fresh challenge signs in again.
    const fresh = await challenge('authentication');
    expect((await signIn(passkey.assert(fresh.challenge, { counter: 0 }), fresh.challengeCookie)).response.status).toBe(
      204,
    );
    expect(await sessionsOf(user.id)).toHaveLength(2);
  });

  it('must not answer an MFA challenge via a passkey challenge issued for signing in', async () => {
    const { user, passkey } = await userWithPasskey({ mfaRequired: true });
    const mfaToken = await createMfaToken(user);
    const mfaCookie = authCookie('confirm-mfa', mfaToken);
    const confirmMfaRow = async () =>
      (
        await db
          .select()
          .from(tokensTable)
          .where(and(eq(tokensTable.type, 'confirm-mfa'), eq(tokensTable.secret, hashToken(mfaToken))))
      )[0];

    const signInChallenge = await challenge('authentication');
    const wrongPurpose = await signIn(
      passkey.assert(signInChallenge.challenge, { counter: 1 }),
      `${mfaCookie}; ${signInChallenge.challengeCookie}`,
      'mfa',
    );
    expect(wrongPurpose.response.status).toBe(401);
    expect((wrongPurpose.error as ErrorResponse).type).toBe('passkey_verification_failed');
    expect(await sessionsOf(user.id)).toHaveLength(0);
    expect(await confirmMfaRow()).toBeDefined();

    // Positive control: a challenge issued for this MFA challenge completes it.
    const mfaChallenge = await challenge('mfa', mfaCookie);
    const completed = await signIn(
      passkey.assert(mfaChallenge.challenge, { counter: 1 }),
      `${mfaCookie}; ${mfaChallenge.challengeCookie}`,
      'mfa',
    );
    expect(completed.response.status).toBe(204);
    expect(await confirmMfaRow()).toBeUndefined();
  });

  it('must not sign in via a stale signature counter', async () => {
    const { user, passkey } = await userWithPasskey({ counter: 5 });

    const stale = await challenge('authentication');
    const refused = await signIn(passkey.assert(stale.challenge, { counter: 5 }), stale.challengeCookie);
    expect(refused.response.status).toBe(401);
    expect((refused.error as ErrorResponse).type).toBe('passkey_verification_failed');
    expect(await sessionsOf(user.id)).toHaveLength(0);
    expect((await storedPasskey(passkey.credentialId)).counter).toBe(5);

    // Positive control: a counter past the stored one signs in and is stored.
    const fresh = await challenge('authentication');
    expect((await signIn(passkey.assert(fresh.challenge, { counter: 6 }), fresh.challengeCookie)).response.status).toBe(
      204,
    );
    expect((await storedPasskey(passkey.credentialId)).counter).toBe(6);
  });

  it('must not sign in via a copy of a passkey whose counter moved on during verification', async () => {
    const { user, passkey } = await userWithPasskey({ counter: 0 });
    const { challenge: value, challengeCookie } = await challenge('authentication');

    // A clone of the authenticator signs in with the same counter while this response is being verified.
    hooks.afterVerify = async () => {
      await db.update(passkeysTable).set({ counter: 1 }).where(eq(passkeysTable.credentialId, passkey.credentialId));
    };
    const raced = await signIn(passkey.assert(value, { counter: 1 }), challengeCookie);
    expect(raced.response.status).toBe(401);
    expect((raced.error as ErrorResponse).type).toBe('passkey_verification_failed');
    expect(await sessionsOf(user.id)).toHaveLength(0);
    expect((await storedPasskey(passkey.credentialId)).counter).toBe(1);

    // Positive control: without a concurrent use, the next counter signs in.
    hooks.afterVerify = undefined;
    const fresh = await challenge('authentication');
    expect((await signIn(passkey.assert(fresh.challenge, { counter: 2 }), fresh.challengeCookie)).response.status).toBe(
      204,
    );
  });

  it("must not register a passkey via another account's credential id", async () => {
    const { user: victim, passkey: victimPasskey } = await userWithPasskey();
    const attacker = await createUser(`attacker-${nanoid(8)}@security-test.com`);
    const sessionCookie = await createTestSession(attacker);

    const register = async (passkey: Passkey) => {
      const { challenge: value, challengeCookie } = await challenge('registration', sessionCookie);
      return call(createPasskey, {
        body: { attestation: passkey.attest(value), nameOnDevice: 'Attacker device' },
        headers: { ...defaultHeaders, Cookie: `${sessionCookie}; ${challengeCookie}` },
      });
    };

    const squat = await register(softwarePasskey({ credentialId: victimPasskey.credentialId }));
    expect(squat.response.status).toBe(409);
    const holders = await db
      .select({ userId: passkeysTable.userId })
      .from(passkeysTable)
      .where(eq(passkeysTable.credentialId, victimPasskey.credentialId));
    expect(holders).toEqual([{ userId: victim.id }]);

    // The victim's passkey still signs the victim in.
    const victimChallenge = await challenge('authentication');
    const victimSignIn = await signIn(victimPasskey.assert(victimChallenge.challenge), victimChallenge.challengeCookie);
    expect(victimSignIn.response.status).toBe(204);
    expect(await sessionsOf(victim.id)).toHaveLength(1);

    // Positive control: a credential of the attacker's own registers.
    expect((await register(softwarePasskey())).response.status).toBe(201);
  });
});
