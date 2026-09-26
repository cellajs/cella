import { eq } from 'drizzle-orm';
import { deletePasskey, generatePasskeyChallenge, signInWithPasskey } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mockPasskeyRecord } from '#/modules/auth/auth-mocks';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders, signUpUser } from '../fixtures';
import {
  authCookie,
  createMfaToken,
  createTestSession,
  createUser,
  type ErrorResponse,
  passkeySignInBody,
} from '../helpers';
import { softwarePasskey } from '../software-passkey';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearDatabase();
});

describe('Passkey Authentication', async () => {
  const call = await createAppClient();

  /** A user with a software passkey registered. */
  async function userWithPasskey(email = signUpUser.email) {
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

  /** A challenge of `type`, its cookie, and the credential ids it lists. */
  async function challenge(type: 'authentication' | 'mfa' = 'authentication', cookie?: string) {
    const { data, response } = await call(generatePasskeyChallenge, {
      body: { type },
      headers: { ...defaultHeaders, ...(cookie ? { Cookie: cookie } : {}) },
    });
    expect(response.status).toBe(200);
    const challengeCookie =
      response.headers
        .getSetCookie()
        .find((line) => line.startsWith(`${authCookieName('passkey-challenge')}=`))
        ?.split(';')[0] ?? '';
    const { challenge: value, credentialIds } = data as { challenge: string; credentialIds: string[] };
    return { challenge: value, credentialIds, challengeCookie };
  }

  describe('Challenge Generation', () => {
    it('should generate a sign-in challenge that lists no credentials', async () => {
      await userWithPasskey();

      const { challenge: value, credentialIds } = await challenge('authentication');
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(credentialIds).toHaveLength(0);
    });

    it("should list the account's passkeys for an MFA challenge", async () => {
      const { user } = await userWithPasskey();
      const second = mockPasskeyRecord(user.id, 'Linux Device', 'passkey-record:second');
      await db.insert(passkeysTable).values(second);
      const mfaCookie = authCookie('confirm-mfa', await createMfaToken(user));

      const { credentialIds } = await challenge('mfa', mfaCookie);
      expect(credentialIds).toHaveLength(2);
      expect(credentialIds).toContain(second.credentialId);
    });

    it('should refuse an MFA challenge without a second-factor challenge in progress', async () => {
      const user = await createUser(signUpUser.email);
      await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, user.id));

      const { response: res, error } = await call(generatePasskeyChallenge, {
        body: { type: 'mfa' },
        headers: defaultHeaders,
      });
      expect(res.status).toBe(401);
      expect((error as ErrorResponse).type).toBe('confirm-mfa_not_found');
    });
  });

  describe('Passkey Verification', () => {
    it('should reject verification without a challenge', async () => {
      const { passkey } = await userWithPasskey();

      const { response: res, error } = await call(signInWithPasskey, {
        body: { type: 'authentication', assertion: passkey.assert(nanoid(43)) },
        headers: defaultHeaders,
      });
      expect(res.status).toBe(401);
      expect((error as ErrorResponse).type).toBe('passkey_verification_failed');
    });

    it.each([
      ['an unknown credential ID', nanoid(32)],
      ['an empty credential ID', ''],
      ['a very long credential ID', 'a'.repeat(1000)],
    ])('should reject verification with %s', async (_label, credentialId) => {
      const { challenge: value, challengeCookie } = await challenge();

      const { response: res, error } = await call(signInWithPasskey, {
        body: passkeySignInBody({ credentialId, challenge: value }),
        headers: { ...defaultHeaders, Cookie: challengeCookie },
      });
      expect(res.status).toBe(404);
      expect((error as ErrorResponse).type).toBe('passkey_not_found');
    });

    it.each([
      ['invalid JSON', 'invalid-json'],
      ['very long client data', 'a'.repeat(10000)],
    ])('should reject verification with %s', async (_label, clientDataJSON) => {
      const { passkey } = await userWithPasskey();
      const { challenge: value, challengeCookie } = await challenge();
      const assertion = passkey.assert(value);
      assertion.response.clientDataJSON = clientDataJSON;

      const { response: res, error } = await call(signInWithPasskey, {
        body: { type: 'authentication', assertion },
        headers: { ...defaultHeaders, Cookie: challengeCookie },
      });
      expect(res.status).toBe(401);
      expect((error as ErrorResponse).type).toBe('passkey_verification_failed');
    });
  });

  describe('Passkey Deletion (IDOR)', () => {
    // GHSA-4vcf-q4xf-f48m: deleting a passkey must be scoped to the owner; a user
    // cannot delete another user's passkey by id.
    it("must not delete another user's passkey via its id", async () => {
      const victim = await createUser('victim@example.com');
      const attacker = await createUser('attacker@example.com');

      const [victimPasskey] = await db
        .insert(passkeysTable)
        .values(mockPasskeyRecord(victim.id, 'Victim Device', 'passkey-victim'))
        .returning();
      const stored = () => db.select().from(passkeysTable).where(eq(passkeysTable.id, victimPasskey.id));
      const remove = async (cookie: string) =>
        (await call(deletePasskey, { path: { id: victimPasskey.id }, headers: { ...defaultHeaders, Cookie: cookie } }))
          .response.status;

      // The delete is scoped to the caller, so it is a no-op for the attacker.
      expect(await remove(await createTestSession(attacker))).toBe(204);
      expect(await stored()).toHaveLength(1);

      // The owner's delete removes it (positive control).
      expect(await remove(await createTestSession(victim))).toBe(204);
      expect(await stored()).toHaveLength(0);
    });
  });
});
