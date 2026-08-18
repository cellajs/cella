import { eq } from 'drizzle-orm';
import { deletePasskey, generatePasskeyChallenge, signInWithPasskey } from 'sdk';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mockPasskeyRecord } from '#/modules/auth/auth-mocks';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders, signUpUser } from '../fixtures';
import { createMfaToken, createTestSession, createUser, type ErrorResponse, passkeySignInBody } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

vi.mock('#/modules/auth/passkeys/helpers/passkey', async () => {
  const actual = await vi.importActual('#/modules/auth/passkeys/helpers/passkey');
  return {
    ...actual,
    validatePasskey: vi.fn().mockResolvedValue(undefined),
  };
});

setTestConfig({ enabledAuthStrategies: ['passkey'] });

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearDatabase();
  vi.clearAllMocks();
});

describe('Passkey Authentication', async () => {
  const call = await createAppClient();

  describe('Challenge Generation', () => {
    it('should generate challenge for authentication', async () => {
      const user = await createUser(signUpUser.email);

      const passkeyRecord = mockPasskeyRecord(user.id);
      await db.insert(passkeysTable).values(passkeyRecord);

      const { response: res, data } = await call(generatePasskeyChallenge, {
        body: { type: 'authentication', email: signUpUser.email },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(200);
      const response = data as { challenge: string; credentialIds: string[] };
      expect(response.challenge).toBeDefined();
      expect(response.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(response.credentialIds).toContain(passkeyRecord.credentialId);
    });

    it('should generate challenge for MFA without tocken', async () => {
      const user = await createUser(signUpUser.email);
      await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, user.id));

      // The MFA challenge needs a confirm-mfa token from initial authentication; without one, 401.
      const { response: res, error } = await call(generatePasskeyChallenge, {
        body: { type: 'mfa' },
        headers: defaultHeaders,
      });
      expect(res.status).toBe(401);
      const response = error as { type: string };

      expect(response.type).toBe('confirm-mfa_not_found');
    });

    it('should reject challenge generation for non-existent user', async () => {
      const { response: res, data } = await call(generatePasskeyChallenge, {
        body: { type: 'authentication', email: 'nonexistent@example.com' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(200);
      const response = data as { challenge: string; credentialIds: string[] };
      expect(response.challenge).toBeDefined();
      expect(response.credentialIds).toHaveLength(0);
    });

    it('should require email for authentication type', async () => {
      const { response: res, data } = await call(generatePasskeyChallenge, {
        body: { type: 'authentication' },
        headers: defaultHeaders,
      });

      // Handler returns 200 with empty credentials when email is not provided
      expect(res.status).toBe(200);
      const response = data as { challenge: string; credentialIds: string[] };
      expect(response.challenge).toBeDefined();
      expect(response.credentialIds).toHaveLength(0);
    });

    it('should reject invalid challenge type', async () => {
      // SDK validates client-side before sending the request
      const { error, response } = await call(generatePasskeyChallenge, {
        body: { type: 'invalid' as any },
        headers: defaultHeaders,
      });
      expect(error).toBeInstanceOf(Error);
      expect(response).toBeUndefined();
    });
  });

  describe('Passkey Verification', () => {
    it('should reject verification with missing fields', async () => {
      // SDK validates client-side before sending the request
      const { error, response } = await call(signInWithPasskey, {
        body: { type: 'authentication' } as any,
        headers: defaultHeaders,
      });
      expect(error).toBeInstanceOf(Error);
      expect(response).toBeUndefined();
    });

    it('should reject verification with invalid credential ID', async () => {
      const { response: res, error } = await call(signInWithPasskey, {
        body: passkeySignInBody({ credentialId: '', email: signUpUser.email }),
        headers: defaultHeaders,
      });

      expect(res.status).toBe(404);
      expect((error as ErrorResponse).type).toBe('not_found');
    });

    it('should reject verification with invalid JSON', async () => {
      const body = passkeySignInBody({ credentialId: nanoid(32), email: signUpUser.email });
      body.assertion.response.clientDataJSON = 'invalid-json';

      const { response: res, error } = await call(signInWithPasskey, {
        body,
        headers: defaultHeaders,
      });

      expect(res.status).toBe(404);
      expect((error as ErrorResponse).type).toBe('not_found');
    });

    it('should reject verification for non-existent passkey', async () => {
      await createUser(signUpUser.email);

      const { response: res } = await call(signInWithPasskey, {
        body: passkeySignInBody({ credentialId: nanoid(32), email: signUpUser.email }),
        headers: defaultHeaders,
      });

      expect(res.status).toBe(204);
    });
  });

  describe('Passkey Deletion (IDOR)', () => {
    // GHSA-4vcf-q4xf-f48m: deleting a passkey must be scoped to the owner; a user
    // cannot delete another user's passkey by id.
    it("should not allow a user to delete another user's passkey", async () => {
      const victim = await createUser('victim@example.com');
      const attacker = await createUser('attacker@example.com');

      const [victimPasskey] = await db
        .insert(passkeysTable)
        .values(mockPasskeyRecord(victim.id, 'Victim Device', 'passkey-victim'))
        .returning();

      const attackerSession = await createTestSession(attacker);

      const { response: res } = await call(deletePasskey, {
        path: { id: victimPasskey.id },
        headers: { ...defaultHeaders, Cookie: attackerSession },
      });

      // The delete is scoped to the caller, so it is a no-op for the attacker.
      expect(res.status).toBe(204);

      const remaining = await db.select().from(passkeysTable).where(eq(passkeysTable.id, victimPasskey.id));
      expect(remaining).toHaveLength(1);
    });
  });

  describe('Configuration & Feature Flags', () => {
    it('should reject passkey operations when strategy is disabled', async () => {
      setTestConfig({ enabledAuthStrategies: ['totp'] });
      onTestFinished(() => setTestConfig({ enabledAuthStrategies: ['passkey'] }));

      const user = await createUser(signUpUser.email);

      const passkeyRecord = mockPasskeyRecord(user.id);
      await db.insert(passkeysTable).values(passkeyRecord);

      const { error } = await call(signInWithPasskey, {
        body: passkeySignInBody({ credentialId: passkeyRecord.credentialId, email: signUpUser.email }),
        headers: defaultHeaders,
      });

      expect((error as ErrorResponse).type).toBe('forbidden_strategy');
    });

    it('should reject malformed email in challenge request', async () => {
      const { response, error } = await call(generatePasskeyChallenge, {
        body: { type: 'authentication', email: 'invalid-email' },
        headers: defaultHeaders,
      });

      expect(error).toBeInstanceOf(Error);
      expect(response).toBeUndefined();
    });
  });

  describe('Security & Input Validation', () => {
    it('should handle very long credential ID', async () => {
      const { response: res, error } = await call(signInWithPasskey, {
        body: passkeySignInBody({ credentialId: 'a'.repeat(1000), email: signUpUser.email }),
        headers: defaultHeaders,
      });

      expect(res.status).toBe(404);
      expect((error as ErrorResponse).type).toBe('not_found');
    });

    it('should handle very long client data', async () => {
      const body = passkeySignInBody({ credentialId: nanoid(32), email: signUpUser.email });
      body.assertion.response.clientDataJSON = 'a'.repeat(10000);

      const { response: res, error } = await call(signInWithPasskey, {
        body,
        headers: defaultHeaders,
      });

      expect(res.status).toBe(404);
      expect((error as ErrorResponse).type).toBe('not_found');
    });
  });

  describe('Integration & Edge Cases', () => {
    it('should handle multiple passkeys for user', async () => {
      const user = await createUser(signUpUser.email);

      const passkey1 = mockPasskeyRecord(user.id, 'Mac Device');
      const passkey2 = mockPasskeyRecord(user.id, 'Linux Device');
      await db.insert(passkeysTable).values([passkey1, passkey2]);

      const { response: res, data } = await call(generatePasskeyChallenge, {
        body: { type: 'authentication', email: signUpUser.email },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(200);
      const response = data as { challenge: string; credentialIds: string[] };
      expect(response.credentialIds).toHaveLength(2);
      expect(response.credentialIds).toContain(passkey1.credentialId);
      expect(response.credentialIds).toContain(passkey2.credentialId);
    });

    it('should handle user with no passkeys', async () => {
      await createUser(signUpUser.email);
      const { response: res, data } = await call(generatePasskeyChallenge, {
        body: { type: 'authentication', email: signUpUser.email },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(200);
      const response = data as { challenge: string; credentialIds: string[] };
      expect(response.credentialIds).toHaveLength(0);
      expect(response.challenge).toBeDefined();
    });
  });

  describe('Successful Authentication', () => {
    it('should authenticate successfully with valid passkey', async () => {
      const user = await createUser(signUpUser.email);

      const passkeyRecord = mockPasskeyRecord(user.id);
      await db.insert(passkeysTable).values(passkeyRecord);

      const { response: challengeRes, data: challengeData } = await call(generatePasskeyChallenge, {
        body: { type: 'authentication', email: signUpUser.email },
        headers: defaultHeaders,
      });

      expect(challengeRes.status).toBe(200);
      const challengeResponse = challengeData as { challenge: string; credentialIds: string[] };
      expect(challengeResponse.challenge).toBeDefined();

      const { response: verificationRes } = await call(signInWithPasskey, {
        body: passkeySignInBody({
          credentialId: passkeyRecord.credentialId,
          email: signUpUser.email,
          challenge: challengeResponse.challenge,
        }),
        headers: defaultHeaders,
      });

      expect(verificationRes.status).toBe(204);

      const setCookieHeader = verificationRes.headers.get('set-cookie');
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);
    });

    it('should authenticate successfully with MFA passkey', async () => {
      const user = await createUser(signUpUser.email);
      await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, user.id));

      const passkeyRecord = mockPasskeyRecord(user.id, 'MFA Device');
      await db.insert(passkeysTable).values(passkeyRecord);

      const mfaToken = await createMfaToken(user);

      const { response: res } = await call(signInWithPasskey, {
        body: passkeySignInBody({ credentialId: passkeyRecord.credentialId, email: signUpUser.email, type: 'mfa' }),
        headers: {
          ...defaultHeaders,
          Cookie: `${authCookieName('confirm-mfa')}=${mfaToken}`,
        },
      });
      expect(res.status).toBe(204);

      const setCookieHeader = res.headers.get('set-cookie');
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);
    });
  });
});
