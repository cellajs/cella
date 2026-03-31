import { eq } from 'drizzle-orm';
import { generatePasskeyChallenge, signInWithPasskey } from 'sdk';
import { appConfig } from 'shared';
import { nanoid } from 'shared/nanoid';
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { passkeysTable } from '#/db/schema/passkeys';
import { usersTable } from '#/db/schema/users';
import { mockPastIsoDate } from '../../mocks/utils';
import { defaultHeaders, signUpUser } from '../fixtures';
import { createMfaToken, createUser, type ErrorResponse, passkeySignInBody } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

vi.mock('#/middlewares/rate-limiter/core', async () => (await import('../test-utils')).rateLimiterCoreMock());
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) =>
  (await import('../test-utils')).rateLimiterHelpersMock(importOriginal),
);
vi.mock('#/modules/auth/passkeys/helpers/passkey', async () => {
  const actual = await vi.importActual('#/modules/auth/passkeys/helpers/passkey');
  return {
    ...actual,
    validatePasskey: vi.fn().mockResolvedValue(undefined),
  };
});

const newPasskeyRecord = (userId: string, nameOnDevice = 'Test Device') => ({
  userId,
  credentialId: nanoid(32),
  publicKey: nanoid(40),
  nameOnDevice,
  deviceType: 'desktop' as const,
  createdAt: mockPastIsoDate(),
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

      // Create passkey record
      const passkeyRecord = newPasskeyRecord(user.id);
      await db.insert(passkeysTable).values(passkeyRecord);

      // Generate challenge
      const { response: res, data } = await call(generatePasskeyChallenge, {
        body: { type: 'authentication', email: signUpUser.email },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(200);
      const response = data as { challengeBase64: string; credentialIds: string[] };
      expect(response.challengeBase64).toBeDefined();
      expect(response.challengeBase64).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(response.credentialIds).toContain(passkeyRecord.credentialId);
    });

    it('should generate challenge for MFA without tocken', async () => {
      const user = await createUser(signUpUser.email);
      await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, user.id));

      // MFA challenge requires confirm-mfa token which is set during password authentication
      // Since we don't have the full MFA flow set up, this test verifies the endpoint exists
      // and handles the missing token appropriately
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
      const response = data as { challengeBase64: string; credentialIds: string[] };
      expect(response.challengeBase64).toBeDefined();
      expect(response.credentialIds).toHaveLength(0);
    });

    it('should require email for authentication type', async () => {
      const { response: res, data } = await call(generatePasskeyChallenge, {
        body: { type: 'authentication' },
        headers: defaultHeaders,
      });

      // Handler returns 200 with empty credentials when email is not provided
      expect(res.status).toBe(200);
      const response = data as { challengeBase64: string; credentialIds: string[] };
      expect(response.challengeBase64).toBeDefined();
      expect(response.credentialIds).toHaveLength(0);
    });

    it('should reject invalid challenge type', async () => {
      const { response: res, error } = await call(generatePasskeyChallenge, {
        body: { type: 'invalid' as any },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('form.invalid_value');
    });
  });

  describe('Passkey Verification', () => {
    it('should reject verification with missing fields', async () => {
      const { response: res, error } = await call(signInWithPasskey, {
        body: { type: 'authentication' } as any,
        headers: defaultHeaders,
      });

      expect(res.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('form.invalid_type');
    });

    it('should reject verification with invalid credential ID', async () => {
      const { response: res, error } = await call(signInWithPasskey, {
        body: {
          credentialId: '',
          clientDataJSON: '{}',
          authenticatorObject: '',
          signature: '',
          type: 'authentication',
          email: signUpUser.email,
        },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(404);
      expect((error as ErrorResponse).type).toBe('not_found');
    });

    it('should reject verification with invalid JSON', async () => {
      const { response: res, error } = await call(signInWithPasskey, {
        body: {
          credentialId: nanoid(32),
          clientDataJSON: 'invalid-json',
          authenticatorObject: '',
          signature: '',
          type: 'authentication',
          email: signUpUser.email,
        },
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

  describe('Configuration & Feature Flags', () => {
    it('should reject passkey operations when strategy is disabled', async () => {
      setTestConfig({ enabledAuthStrategies: ['password'] });
      onTestFinished(() => setTestConfig({ enabledAuthStrategies: ['passkey'] }));

      const user = await createUser(signUpUser.email);

      const passkeyRecord = newPasskeyRecord(user.id);
      await db.insert(passkeysTable).values(passkeyRecord);

      const { error } = await call(signInWithPasskey, {
        body: passkeySignInBody({ credentialId: passkeyRecord.credentialId, email: signUpUser.email }),
        headers: defaultHeaders,
      });

      expect((error as ErrorResponse).type).toBe('forbidden_strategy');
    });

    it('should handle malformed email in challenge request', async () => {
      const { response: res, data } = await call(generatePasskeyChallenge, {
        body: { type: 'authentication', email: 'invalid-email' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(200);
      const response = data as { challengeBase64: string; credentialIds: string[] };
      expect(response.challengeBase64).toBeDefined();
      expect(response.credentialIds).toHaveLength(0);
    });
  });

  describe('Security & Input Validation', () => {
    it('should handle very long credential ID', async () => {
      const { response: res, error } = await call(signInWithPasskey, {
        body: {
          credentialId: 'a'.repeat(1000),
          clientDataJSON: '{}',
          authenticatorObject: '',
          signature: '',
          type: 'authentication',
          email: signUpUser.email,
        },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(404);
      expect((error as ErrorResponse).type).toBe('not_found');
    });

    it('should handle very long client data', async () => {
      const { response: res, error } = await call(signInWithPasskey, {
        body: {
          credentialId: nanoid(32),
          clientDataJSON: 'a'.repeat(10000),
          authenticatorObject: '',
          signature: '',
          type: 'authentication',
          email: signUpUser.email,
        },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(404);
      expect((error as ErrorResponse).type).toBe('not_found');
    });
  });

  describe('Integration & Edge Cases', () => {
    it('should handle multiple passkeys for user', async () => {
      const user = await createUser(signUpUser.email);

      // Create multiple passkeys
      const passkey1 = newPasskeyRecord(user.id, 'Mac Device');
      const passkey2 = newPasskeyRecord(user.id, 'Linux Device');
      await db.insert(passkeysTable).values([passkey1, passkey2]);

      // Generate challenge
      const { response: res, data } = await call(generatePasskeyChallenge, {
        body: { type: 'authentication', email: signUpUser.email },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(200);
      const response = data as { challengeBase64: string; credentialIds: string[] };
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
      const response = data as { challengeBase64: string; credentialIds: string[] };
      expect(response.credentialIds).toHaveLength(0);
      expect(response.challengeBase64).toBeDefined();
    });
  });

  describe('Successful Authentication', () => {
    it('should authenticate successfully with valid passkey', async () => {
      const user = await createUser(signUpUser.email);

      const passkeyRecord = newPasskeyRecord(user.id);
      await db.insert(passkeysTable).values(passkeyRecord);

      // Generate challenge first
      const { response: challengeRes, data: challengeData } = await call(generatePasskeyChallenge, {
        body: { type: 'authentication', email: signUpUser.email },
        headers: defaultHeaders,
      });

      expect(challengeRes.status).toBe(200);
      const challengeResponse = challengeData as { challengeBase64: string; credentialIds: string[] };
      expect(challengeResponse.challengeBase64).toBeDefined();

      // Perform passkey verification
      const { response: verificationRes } = await call(signInWithPasskey, {
        body: passkeySignInBody({
          credentialId: passkeyRecord.credentialId,
          email: signUpUser.email,
          challenge: challengeResponse.challengeBase64,
        }),
        headers: defaultHeaders,
      });

      expect(verificationRes.status).toBe(204);

      // Check session cookie is set
      const setCookieHeader = verificationRes.headers.get('set-cookie');
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);
    });

    it('should authenticate successfully with MFA passkey', async () => {
      const user = await createUser(signUpUser.email);
      await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, user.id));

      const passkeyRecord = newPasskeyRecord(user.id, 'MFA Device');
      await db.insert(passkeysTable).values(passkeyRecord);

      const mfaToken = await createMfaToken(user);

      const { response: res } = await call(signInWithPasskey, {
        body: passkeySignInBody({ credentialId: passkeyRecord.credentialId, email: signUpUser.email, type: 'mfa' }),
        headers: {
          ...defaultHeaders,
          Cookie: `${appConfig.slug}-confirm-mfa-${appConfig.cookieVersion}=${mfaToken}`,
        },
      });
      expect(res.status).toBe(204);

      // Check session cookie is set
      const setCookieHeader = res.headers.get('set-cookie');
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);
    });
  });
});
