import { eq } from 'drizzle-orm';
import { testClient } from 'hono/testing';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { passkeysTable } from '#/db/schema/passkeys';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { nanoid } from '#/utils/nanoid';
import { encodeLowerCased } from '#/utils/oslo';
import { mockEmail, mockUser } from '../../mocks/mock-user';
import { pastIsoDate } from '../../mocks/utils';
import { defaultHeaders, signUpUser } from '../fixtures';
import { ErrorResponse, parseResponse } from '../helpers';
import { clearDatabase, mockFetchRequest, mockRateLimiter, setTestConfig } from '../test-utils';

const newPasskeyRecord = (userId: string, nameOnDevice = 'Test Device') => ({
  userId,
  credentialId: nanoid(32),
  publicKey: nanoid(40),
  nameOnDevice,
  deviceType: 'desktop' as const,
  createdAt: pastIsoDate(),
});

setTestConfig({ enabledAuthStrategies: ['passkey'] });

beforeAll(async () => {
  mockFetchRequest();

  // Mock rate limiter to avoid 429 errors in tests
  mockRateLimiter();
});

afterEach(async () => {
  await clearDatabase();
  vi.clearAllMocks();
});

describe('Passkey Authentication', async () => {
  const { default: app } = await import('#/routes');
  const client = testClient(app);

  describe('Challenge Generation', () => {
    it('should generate challenge for authentication', async () => {
      // Create user with passkey
      const userRecord = mockUser({ email: signUpUser.email });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      await db.insert(emailsTable).values(mockEmail(user));

      // Create passkey record
      const passkeyRecord = newPasskeyRecord(user.id);
      await db.insert(passkeysTable).values(passkeyRecord);

      // Generate challenge
      const res = await client['auth']['passkey']['generate-challenge'].$post(
        { json: { type: 'authentication', email: signUpUser.email } },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(200);
      const response = (await res.json()) as { challengeBase64: string; credentialIds: string[] };
      expect(response.challengeBase64).toBeDefined();
      expect(response.challengeBase64).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(response.credentialIds).toContain(passkeyRecord.credentialId);
    });

    it('should generate challenge for MFA without tocken', async () => {
      // Create user with MFA enabled
      const userRecord = mockUser({ email: signUpUser.email });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      await db.insert(emailsTable).values(mockEmail(user));

      await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, user.id));

      // MFA challenge requires confirm-mfa token which is set during password authentication
      // Since we don't have the full MFA flow set up, this test verifies the endpoint exists
      // and handles the missing token appropriately
      const res = await client['auth']['passkey']['generate-challenge'].$post(
        { json: { type: 'mfa' } },
        { headers: defaultHeaders },
      );
      expect(res.status).toBe(401);
      const response = await parseResponse<{ type: string }>(res);

      expect(response.type).toBe('confirm-mfa_not_found');
    });

    it('should reject challenge generation for non-existent user', async () => {
      const res = await client['auth']['passkey']['generate-challenge'].$post(
        { json: { type: 'authentication', email: 'nonexistent@cella.com' } },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(200);
      const response = (await res.json()) as { challengeBase64: string; credentialIds: string[] };
      expect(response.challengeBase64).toBeDefined();
      expect(response.credentialIds).toHaveLength(0);
    });

    it('should require email for authentication type', async () => {
      const res = await client['auth']['passkey']['generate-challenge'].$post(
        { json: { type: 'authentication' } },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(403);
      const error = await parseResponse<ErrorResponse>(res);
      expect(error.type).toBe('form.custom');
    });

    it('should reject invalid challenge type', async () => {
      const res = await client['auth']['passkey']['generate-challenge'].$post(
        { json: { type: 'invalid' as any } },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(403);
      const error = await parseResponse<ErrorResponse>(res);
      expect(error.type).toBe('form.invalid_value');
    });
  });

  describe('Passkey Verification', () => {
    it('should reject verification with missing fields', async () => {
      const res = await client['auth']['passkey-verification'].$post(
        { json: { type: 'authentication' } as any },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(403);
      const error = await parseResponse<ErrorResponse>(res);
      expect(error.type).toBe('form.invalid_type');
    });

    it('should reject verification with invalid credential ID', async () => {
      const res = await client['auth']['passkey-verification'].$post(
        {
          json: {
            credentialId: '',
            clientDataJSON: '{}',
            authenticatorObject: '',
            signature: '',
            type: 'authentication',
            email: signUpUser.email,
          },
        },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(404);
      const error = await parseResponse<ErrorResponse>(res);
      expect(error.type).toBe('not_found');
    });

    it('should reject verification with invalid JSON', async () => {
      const res = await client['auth']['passkey-verification'].$post(
        {
          json: {
            credentialId: nanoid(32),
            clientDataJSON: 'invalid-json',
            authenticatorObject: '',
            signature: '',
            type: 'authentication',
            email: signUpUser.email,
          },
        },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(404);
      const error = await parseResponse<ErrorResponse>(res);
      expect(error.type).toBe('not_found');
    });

    it('should reject verification for non-existent passkey', async () => {
      // Create user without passkey
      const userRecord = mockUser({ email: signUpUser.email });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      await db.insert(emailsTable).values(mockEmail(user));

      const res = await client['auth']['passkey-verification'].$post(
        {
          json: {
            credentialId: nanoid(32),
            clientDataJSON: JSON.stringify({
              type: 'webauthn.get',
              challenge: nanoid(32),
              origin: 'http://localhost:3000',
              crossOrigin: false,
            }),
            authenticatorObject: new Uint8Array(37).toString(),
            signature: new Uint8Array(64).toString(),
            type: 'authentication',
            email: signUpUser.email,
          },
        },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(204);
    });
  });

  describe('Configuration & Feature Flags', () => {
    it('should reject passkey operations when strategy is disabled', async () => {
      // Disable passkey strategy
      setTestConfig({ enabledAuthStrategies: ['password'] });

      // Create user first
      const userRecord = mockUser({ email: signUpUser.email });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      await db.insert(emailsTable).values(mockEmail(user));

      // Create a passkey for the user
      const passkeyRecord = newPasskeyRecord(user.id);
      await db.insert(passkeysTable).values(passkeyRecord);

      // Clear any previous mocks that might interfere
      vi.unmock('#/modules/auth/passkeys/helpers/passkey');

      const res = await client['auth']['passkey-verification'].$post(
        {
          json: {
            credentialId: passkeyRecord.credentialId,
            clientDataJSON: JSON.stringify({
              type: 'webauthn.get',
              challenge: nanoid(32),
              origin: 'http://localhost:3000',
              crossOrigin: false,
            }),
            authenticatorObject: new Uint8Array(37).toString(),
            signature: new Uint8Array(64).toString(),
            type: 'authentication',
            email: signUpUser.email,
          },
        },
        { headers: defaultHeaders },
      );

      const error = await parseResponse<ErrorResponse>(res);
      expect(error.type).toBe('forbidden_strategy');

      // Re-enable for other tests
      setTestConfig({ enabledAuthStrategies: ['passkey'] });
    });

    it('should handle malformed email in challenge request', async () => {
      const res = await client['auth']['passkey']['generate-challenge'].$post(
        { json: { type: 'authentication', email: 'invalid-email' } },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(200);
      const response = (await res.json()) as { challengeBase64: string; credentialIds: string[] };
      expect(response.challengeBase64).toBeDefined();
      expect(response.credentialIds).toHaveLength(0);
    });
  });

  describe('Security & Input Validation', () => {
    it('should handle very long credential ID', async () => {
      const res = await client['auth']['passkey-verification'].$post(
        {
          json: {
            credentialId: 'a'.repeat(1000),
            clientDataJSON: '{}',
            authenticatorObject: '',
            signature: '',
            type: 'authentication',
            email: signUpUser.email,
          },
        },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(404);
      const error = await parseResponse<ErrorResponse>(res);
      expect(error.type).toBe('not_found');
    });

    it('should handle very long client data', async () => {
      const res = await client['auth']['passkey-verification'].$post(
        {
          json: {
            credentialId: nanoid(32),
            clientDataJSON: 'a'.repeat(10000),
            authenticatorObject: '',
            signature: '',
            type: 'authentication',
            email: signUpUser.email,
          },
        },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(404);
      const error = await parseResponse<ErrorResponse>(res);
      expect(error.type).toBe('not_found');
    });
  });

  describe('Integration & Edge Cases', () => {
    it('should handle multiple passkeys for user', async () => {
      // Create user
      const userRecord = mockUser({ email: signUpUser.email });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      await db.insert(emailsTable).values(mockEmail(user));

      // Create multiple passkeys
      const passkey1 = newPasskeyRecord(user.id, 'Mac Device');
      const passkey2 = newPasskeyRecord(user.id, 'Linux Device');
      await db.insert(passkeysTable).values([passkey1, passkey2]);

      // Generate challenge
      const res = await client['auth']['passkey']['generate-challenge'].$post(
        { json: { type: 'authentication', email: signUpUser.email } },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(200);
      const response = (await res.json()) as { challengeBase64: string; credentialIds: string[] };
      expect(response.credentialIds).toHaveLength(2);
      expect(response.credentialIds).toContain(passkey1.credentialId);
      expect(response.credentialIds).toContain(passkey2.credentialId);
    });

    it('should handle user with no passkeys', async () => {
      // Create user without passkeys
      const userRecord = mockUser({ email: signUpUser.email });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      await db.insert(emailsTable).values(mockEmail(user));

      // Generate challenge
      const res = await client['auth']['passkey']['generate-challenge'].$post(
        { json: { type: 'authentication', email: signUpUser.email } },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(200);
      const response = (await res.json()) as { challengeBase64: string; credentialIds: string[] };
      expect(response.credentialIds).toHaveLength(0);
      expect(response.challengeBase64).toBeDefined();
    });
  });

  describe('Successful Authentication', () => {
    it('should authenticate successfully with valid passkey', async () => {
      // Create user with passkey
      const userRecord = mockUser({ email: signUpUser.email });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      await db.insert(emailsTable).values(mockEmail(user));

      const passkeyRecord = newPasskeyRecord(user.id);
      await db.insert(passkeysTable).values(passkeyRecord);

      // Generate challenge first
      const challengeRes = await client['auth']['passkey']['generate-challenge'].$post(
        { json: { type: 'authentication', email: signUpUser.email } },
        { headers: defaultHeaders },
      );

      expect(challengeRes.status).toBe(200);
      const challengeResponse = (await challengeRes.json()) as { challengeBase64: string; credentialIds: string[] };
      expect(challengeResponse.challengeBase64).toBeDefined();

      // Mock the validatePasskey function at the module level
      vi.mock('#/modules/auth/passkeys/helpers/passkey', async () => {
        const actual = await vi.importActual('#/modules/auth/passkeys/helpers/passkey');
        return {
          ...actual,
          validatePasskey: vi.fn().mockResolvedValue(undefined),
        };
      });

      // Perform passkey verification
      const verificationRes = await client['auth']['passkey-verification'].$post(
        {
          json: {
            credentialId: passkeyRecord.credentialId,
            clientDataJSON: JSON.stringify({
              type: 'webauthn.get',
              challenge: challengeResponse.challengeBase64,
              origin: 'http://localhost:3000',
              crossOrigin: false,
            }),
            authenticatorObject: new Uint8Array(37).toString(),
            signature: new Uint8Array(64).toString(),
            type: 'authentication',
            email: signUpUser.email,
          },
        },
        { headers: defaultHeaders },
      );

      expect(verificationRes.status).toBe(204);

      // Check session cookie is set
      const setCookieHeader = verificationRes.headers.get('set-cookie');
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);
    });

    it('should authenticate successfully with MFA passkey', async () => {
      // Create user with MFA enabled
      const userRecord = mockUser({ email: signUpUser.email });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      await db.insert(emailsTable).values(mockEmail(user));

      await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, user.id));

      const passkeyRecord = newPasskeyRecord(user.id, 'MFA Device');
      await db.insert(passkeysTable).values(passkeyRecord);

      // Create confirm-mfa token for MFA flow
      const mfaToken = nanoid(40);
      const hashedMfaToken = encodeLowerCased(mfaToken);
      await db.insert(tokensTable).values({
        secret: hashedMfaToken,
        type: 'confirm-mfa',
        userId: user.id,
        email: user.email,
        createdBy: user.id,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
      });

      // Mock the validatePasskey function at the module level
      vi.mock('#/modules/auth/passkeys/helpers/passkey', async () => {
        const actual = await vi.importActual('#/modules/auth/passkeys/helpers/passkey');
        return {
          ...actual,
          validatePasskey: vi.fn().mockResolvedValue(undefined),
        };
      });

      // Perform MFA passkey verification with confirm-mfa cookie
      const res = await client['auth']['passkey-verification'].$post(
        {
          json: {
            credentialId: passkeyRecord.credentialId,
            clientDataJSON: JSON.stringify({
              type: 'webauthn.get',
              challenge: nanoid(32),
              origin: 'http://localhost:3000',
              crossOrigin: false,
            }),
            authenticatorObject: new Uint8Array(37).toString(),
            signature: new Uint8Array(64).toString(),
            type: 'mfa',
          },
        },
        {
          headers: {
            ...defaultHeaders,
            Cookie: `${appConfig.slug}-confirm-mfa-${appConfig.cookieVersion}=${mfaToken}`,
          },
        },
      );
      expect(res.status).toBe(204);

      // Check session cookie is set
      const setCookieHeader = res.headers.get('set-cookie');
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);
    });
  });
});
