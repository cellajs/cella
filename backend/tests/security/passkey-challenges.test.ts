import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createPasskey } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders } from '../fixtures';
import {
  authCookie,
  cookieChange,
  createMfaToken,
  createTestSession,
  createUser,
  expectRefusal,
  sessionsOf,
  tokenRowOf,
} from '../helpers';
import { type SoftwarePasskey, softwarePasskey } from '../software-passkey';
import { createAppClient } from '../test-client';
import { setTestConfig } from '../test-utils';
import { clearSecurityTestData, insertPasskey, passkeyChallenge, passkeySignIn } from './helpers';

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

const storedPasskey = async (credentialId: string) =>
  (await db.select().from(passkeysTable).where(eq(passkeysTable.credentialId, credentialId)))[0];

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
    return { user, passkey: await insertPasskey(user, { counter }) };
  }

  it('must not sign in twice via a reused passkey challenge', async () => {
    // Synced passkeys report no signature counter (always 0), so only the challenge stops a replay.
    const { user, passkey } = await userWithPasskey();
    const { challenge: value, cookie: challengeCookie } = await passkeyChallenge('authentication');
    const assertion = passkey.assert(value, { counter: 0 });

    const first = await passkeySignIn(assertion, challengeCookie);
    expect(first.response.status).toBe(204);

    // The same response with the challenge cookie the browser kept.
    const replay = await passkeySignIn(assertion, challengeCookie);
    await expectRefusal(replay, 401, 'passkey_verification_failed');
    expect(cookieChange(replay.response, 'session')).toBeUndefined();
    expect(await sessionsOf(user.id)).toHaveLength(1);

    // Positive control: a fresh challenge signs in again.
    const fresh = await passkeyChallenge('authentication');
    expect((await passkeySignIn(passkey.assert(fresh.challenge, { counter: 0 }), fresh.cookie)).response.status).toBe(
      204,
    );
    expect(await sessionsOf(user.id)).toHaveLength(2);
  });

  it('must not answer an MFA challenge via a passkey challenge issued for signing in', async () => {
    const { user, passkey } = await userWithPasskey({ mfaRequired: true });
    const mfaToken = await createMfaToken(user);
    const mfaCookie = authCookie('confirm-mfa', mfaToken);

    const signInChallenge = await passkeyChallenge('authentication');
    const wrongPurpose = await passkeySignIn(
      passkey.assert(signInChallenge.challenge, { counter: 1 }),
      `${mfaCookie}; ${signInChallenge.cookie}`,
      'mfa',
    );
    await expectRefusal(wrongPurpose, 401, 'passkey_verification_failed');
    expect(await sessionsOf(user.id)).toHaveLength(0);
    expect(await tokenRowOf('confirm-mfa', mfaToken)).toBeDefined();

    // Positive control: a challenge issued for this MFA challenge completes it.
    const mfaChallenge = await passkeyChallenge('mfa', mfaCookie);
    const completed = await passkeySignIn(
      passkey.assert(mfaChallenge.challenge, { counter: 1 }),
      `${mfaCookie}; ${mfaChallenge.cookie}`,
      'mfa',
    );
    expect(completed.response.status).toBe(204);
    expect(await tokenRowOf('confirm-mfa', mfaToken)).toBeUndefined();
  });

  it("must not answer an MFA challenge via another account's passkey", async () => {
    const { user } = await userWithPasskey({ mfaRequired: true });
    const { passkey: attackerPasskey } = await userWithPasskey();
    const mfaCookie = authCookie('confirm-mfa', await createMfaToken(user));

    // The first factor is taken; the passkey that answers is registered to the attacker's own account.
    const mfaChallenge = await passkeyChallenge('mfa', mfaCookie);
    const answered = await passkeySignIn(
      attackerPasskey.assert(mfaChallenge.challenge, { counter: 1 }),
      `${mfaCookie}; ${mfaChallenge.cookie}`,
      'mfa',
    );
    await expectRefusal(answered, 404, 'passkey_not_found');
    expect(cookieChange(answered.response, 'session')).toBeUndefined();
    expect(await sessionsOf(user.id)).toHaveLength(0);
  });

  it('must not sign in via a stale signature counter', async () => {
    const { user, passkey } = await userWithPasskey({ counter: 5 });

    const stale = await passkeyChallenge('authentication');
    const refused = await passkeySignIn(passkey.assert(stale.challenge, { counter: 5 }), stale.cookie);
    await expectRefusal(refused, 401, 'passkey_verification_failed');
    expect(await sessionsOf(user.id)).toHaveLength(0);
    expect((await storedPasskey(passkey.credentialId)).counter).toBe(5);

    // Positive control: a counter past the stored one signs in and is stored.
    const fresh = await passkeyChallenge('authentication');
    expect((await passkeySignIn(passkey.assert(fresh.challenge, { counter: 6 }), fresh.cookie)).response.status).toBe(
      204,
    );
    expect((await storedPasskey(passkey.credentialId)).counter).toBe(6);
  });

  it('must not sign in via a copy of a passkey whose counter moved on during verification', async () => {
    const { user, passkey } = await userWithPasskey({ counter: 0 });
    const { challenge: value, cookie: challengeCookie } = await passkeyChallenge('authentication');

    // A clone of the authenticator signs in with the same counter while this response is being verified.
    hooks.afterVerify = async () => {
      await db.update(passkeysTable).set({ counter: 1 }).where(eq(passkeysTable.credentialId, passkey.credentialId));
    };
    const raced = await passkeySignIn(passkey.assert(value, { counter: 1 }), challengeCookie);
    await expectRefusal(raced, 401, 'passkey_verification_failed');
    expect(await sessionsOf(user.id)).toHaveLength(0);
    expect((await storedPasskey(passkey.credentialId)).counter).toBe(1);

    // Positive control: without a concurrent use, the next counter signs in.
    hooks.afterVerify = undefined;
    const fresh = await passkeyChallenge('authentication');
    expect((await passkeySignIn(passkey.assert(fresh.challenge, { counter: 2 }), fresh.cookie)).response.status).toBe(
      204,
    );
  });

  it("must not register a passkey via another account's credential id", async () => {
    const { user: victim, passkey: victimPasskey } = await userWithPasskey();
    const attacker = await createUser(`attacker-${nanoid(8)}@security-test.com`);
    const sessionCookie = await createTestSession(attacker);

    const register = async (passkey: SoftwarePasskey) => {
      const { challenge: value, cookie: challengeCookie } = await passkeyChallenge('registration', sessionCookie);
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
    const victimChallenge = await passkeyChallenge('authentication');
    const victimSignIn = await passkeySignIn(victimPasskey.assert(victimChallenge.challenge), victimChallenge.cookie);
    expect(victimSignIn.response.status).toBe(204);
    expect(await sessionsOf(victim.id)).toHaveLength(1);

    // Positive control: a credential of the attacker's own registers.
    expect((await register(softwarePasskey())).response.status).toBe(201);
  });
});
