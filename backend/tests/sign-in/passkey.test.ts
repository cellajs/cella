import { eq } from 'drizzle-orm';
import { deletePasskey, generatePasskeyChallenge } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { passkeySchema } from '#/modules/auth/passkeys/passkeys-schema';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders, signUpUser } from '../fixtures';
import { authCookie, createMfaToken, createTestSession, createUser, expectRefusal, mailsTo, rawJsonRequest } from '../helpers';
import { insertPasskey, passkeyChallenge, passkeySignIn } from '../security/helpers';
import { softwarePasskey } from '../software-passkey';
import { createAppClient } from '../test-client';
import { clearDatabase, setTestConfig } from '../test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

afterEach(async () => {
  await clearDatabase();
});

describe('Passkey Authentication', async () => {
  const call = await createAppClient();

  /** A user with a software passkey registered. */
  async function userWithPasskey(email = signUpUser.email) {
    const user = await createUser(email);
    return { user, passkey: await insertPasskey(user) };
  }

  describe('Challenge Generation', () => {
    it('should generate a sign-in challenge that lists no credentials', async () => {
      await userWithPasskey();

      const { challenge: value, credentialIds } = await passkeyChallenge('authentication');
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(credentialIds).toHaveLength(0);
    });

    it("should list the account's passkeys for an MFA challenge", async () => {
      const { user } = await userWithPasskey();
      const second = await insertPasskey(user);
      const mfaCookie = authCookie('confirm-mfa', await createMfaToken(user));

      const { credentialIds } = await passkeyChallenge('mfa', mfaCookie);
      expect(credentialIds).toHaveLength(2);
      expect(credentialIds).toContain(second.credentialId);
    });

    it('should refuse an MFA challenge without a second-factor challenge in progress', async () => {
      const user = await createUser(signUpUser.email);
      await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, user.id));

      const { response: res, error } = await call(generatePasskeyChallenge, { body: { type: 'mfa' }, headers: defaultHeaders });
      await expectRefusal({ response: res, error }, 401, 'confirm-mfa_not_found');
    });
  });

  describe('Passkey Verification', () => {
    it('should reject verification without a challenge', async () => {
      const { passkey } = await userWithPasskey();

      await expectRefusal(await passkeySignIn(passkey.assert(nanoid(43)), ''), 401, 'passkey_verification_failed');
    });

    it.each([
      ['an unknown credential ID', nanoid(32)],
      ['an empty credential ID', ''],
      ['a very long credential ID', 'a'.repeat(1000)],
    ])('should reject verification with %s', async (_label, credentialId) => {
      const { challenge: value, cookie } = await passkeyChallenge('authentication');

      const unknown = await passkeySignIn(softwarePasskey({ credentialId }).assert(value), cookie);
      await expectRefusal(unknown, 404, 'passkey_not_found');
    });

    // Client data past its string cap is refused by the body schema, before verification runs.
    it.each([
      ['invalid JSON', 'invalid-json', 401, 'passkey_verification_failed'],
      ['very long client data', 'a'.repeat(10000), 400, 'form.too_big'],
    ])('should reject verification with %s', async (_label, clientDataJSON, status, type) => {
      const { passkey } = await userWithPasskey();
      const { challenge: value, cookie } = await passkeyChallenge('authentication');
      const assertion = passkey.assert(value);
      assertion.response.clientDataJSON = clientDataJSON;

      await expectRefusal(await passkeySignIn(assertion, cookie), status, type);
    });
  });

  describe('Passkey Responses', () => {
    // The schema leaves out the credential id, public key and signature counter; nothing strips a body at runtime.
    it('should answer a new passkey and the account page with the passkey schema fields only', async () => {
      const user = await createUser(signUpUser.email);
      const sessionCookie = await createTestSession(user);
      const { challenge: value, cookie: challengeCookie } = await passkeyChallenge('registration', sessionCookie);

      const created = await rawJsonRequest('/auth/passkey', `${sessionCookie}; ${challengeCookie}`, {
        method: 'POST',
        body: { attestation: softwarePasskey().attest(value), nameOnDevice: 'Test device' },
      });
      expect(created.status).toBe(201);
      const listed = await rawJsonRequest('/me/auth', sessionCookie);

      const fields = Object.keys(passkeySchema.shape).sort();
      expect(Object.keys(created.body).sort()).toEqual(fields);
      expect(listed.body.passkeys.map((passkey: object) => Object.keys(passkey).sort())).toEqual([fields]);
    });
  });

  describe('Passkey Deletion Notice', () => {
    it('should mail a passkey deletion once, for the delete that removed it', async () => {
      const { user, passkey } = await userWithPasskey();
      const headers = { ...defaultHeaders, Cookie: await createTestSession(user) };
      const deletionMails = () => mailsTo(user.email).filter(({ statics }) => statics.type === 'passkey-deleted');

      // A second click on delete finds no passkey by that id: still 204, and no second mail.
      expect((await call(deletePasskey, { path: { id: passkey.id }, headers })).response.status).toBe(204);
      expect((await call(deletePasskey, { path: { id: passkey.id }, headers })).response.status).toBe(204);
      expect(deletionMails()).toHaveLength(1);
    });
  });

  describe('Passkey Deletion (IDOR)', () => {
    // GHSA-4vcf-q4xf-f48m: deleting a passkey must be scoped to the owner; a user
    // cannot delete another user's passkey by id.
    it("must not delete another user's passkey via its id", async () => {
      const victim = await createUser('victim@example.com');
      const attacker = await createUser('attacker@example.com');

      const victimPasskey = await insertPasskey(victim);
      const stored = () => db.select().from(passkeysTable).where(eq(passkeysTable.id, victimPasskey.id));
      const remove = async (cookie: string) =>
        (await call(deletePasskey, { path: { id: victimPasskey.id }, headers: { ...defaultHeaders, Cookie: cookie } })).response.status;

      // The delete is scoped to the caller, so it is a no-op for the attacker.
      expect(await remove(await createTestSession(attacker))).toBe(204);
      expect(await stored()).toHaveLength(1);

      // The owner's delete removes it (positive control).
      expect(await remove(await createTestSession(victim))).toBe(204);
      expect(await stored()).toHaveLength(0);
    });
  });
});
