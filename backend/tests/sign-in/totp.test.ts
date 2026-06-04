import { eq } from 'drizzle-orm';
import { createTotp, generateTotpKey, signInWithTotp } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { totpsTable } from '#/db/schema/totps';
import { defaultHeaders, signUpUser } from '../fixtures';
import {
  createMfaToken,
  createTestSession,
  createTestUser,
  createTotpUser,
  enableMFAForUser,
  verifyUserEmail,
} from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

vi.mock('#/modules/auth/general/helpers/send-verification-email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('#/modules/auth/totps/helpers/totps', () => ({
  validateTOTP: vi.fn().mockResolvedValue(true),
  signInWithTotp: vi.fn().mockReturnValue(true),
}));

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp'] });

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearDatabase();
  vi.clearAllMocks();
});

describe('TOTP Authentication', async () => {
  const call = await createAppClient();

  describe('TOTP Setup', () => {
    it('should generate TOTP key for authenticated user', async () => {
      // Create and verify a user
      const user = await createTestUser(signUpUser.email);
      await verifyUserEmail(signUpUser.email);

      // Get authenticated session directly
      const sessionCookie = await createTestSession(user);

      // Request TOTP key generation
      const { response: res, data } = await call(generateTotpKey, {
        headers: { ...defaultHeaders, Cookie: sessionCookie },
      });

      expect(res.status).toBe(200);
      const response = data as { totpUri: string; manualKey: string };
      expect(response.totpUri).toBeTruthy();
      expect(response.manualKey).toBeTruthy();
      expect(response.manualKey).toMatch(/^[A-Z2-7]+=*$/); // Base32 format
    });

    it('should create TOTP for user with valid code', async () => {
      // Create and verify a user
      const user = await createTestUser(signUpUser.email);
      await verifyUserEmail(signUpUser.email);

      // Get authenticated session directly
      const sessionCookie = await createTestSession(user);

      // First generate TOTP key
      const { response: generateRes } = await call(generateTotpKey, {
        headers: { ...defaultHeaders, Cookie: sessionCookie },
      });

      expect(generateRes.status).toBe(200);

      // Get totp-challenge cookie from generate response
      const generateCookies = generateRes.headers.get('set-cookie');
      const allCookies = [sessionCookie, generateCookies].filter(Boolean).join('; ');

      // Create TOTP with verification code
      const { response: createRes } = await call(createTotp, {
        body: { code: '123456' },
        headers: { ...defaultHeaders, Cookie: allCookies },
      });

      expect(createRes.status).toBe(201);

      // Verify TOTP was created in database
      const totpRecord = await db.select().from(totpsTable).where(eq(totpsTable.userId, user.id));
      expect(totpRecord).toHaveLength(1);
      expect(totpRecord[0].secret).toBeTruthy();
    });
  });

  describe('TOTP Sign-In Flow', () => {
    it('should sign in with valid TOTP code', async () => {
      const user = await createTotpUser(signUpUser.email);
      const mfaToken = await createMfaToken(user);

      const { response: res } = await call(signInWithTotp, {
        body: { code: '123456' },
        headers: {
          ...defaultHeaders,
          Cookie: `${appConfig.slug}-confirm-mfa-${appConfig.cookieVersion}=${mfaToken}`,
        },
      });

      expect(res.status).toBe(204);
      const setCookieHeader = res.headers.get('set-cookie');
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);
    });

    it('should reject invalid TOTP code', async () => {
      const user = await createTotpUser(signUpUser.email);
      const mfaToken = await createMfaToken(user);

      // Mock TOTP validation to fail
      const { validateTOTP } = await import('#/modules/auth/totps/helpers/totps');
      vi.mocked(validateTOTP).mockRejectedValueOnce(new Error('Invalid TOTP code'));

      const { response: res } = await call(signInWithTotp, {
        body: { code: '000000' },
        headers: {
          ...defaultHeaders,
          Cookie: `${appConfig.slug}-confirm-mfa-${appConfig.cookieVersion}=${mfaToken}`,
        },
      });

      expect(res.status).toBe(500);
    });

    it('should reject TOTP verification for non-existent user', async () => {
      const { response: res, error } = await call(signInWithTotp, {
        body: { code: '123456' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(401);
      const response = error as { type: string };
      expect(response.type).toBe('confirm-mfa_not_found');
    });

    it('should reject TOTP verification for user without TOTP', async () => {
      const user = await createTestUser(signUpUser.email);
      await verifyUserEmail(signUpUser.email);
      await enableMFAForUser(user.id);

      const mfaToken = await createMfaToken(user);

      // Mock validateTOTP to throw 404 error (no TOTP found)
      const { validateTOTP } = await import('#/modules/auth/totps/helpers/totps');
      vi.mocked(validateTOTP).mockRejectedValueOnce(new Error('TOTP not found'));

      const { response: res } = await call(signInWithTotp, {
        body: { code: '123456' },
        headers: {
          ...defaultHeaders,
          Cookie: `${appConfig.slug}-confirm-mfa-${appConfig.cookieVersion}=${mfaToken}`,
        },
      });

      expect(res.status).toBe(500);
    });
  });

  describe('TOTP Security', () => {
    it('should reject malformed TOTP codes via client-side validation', async () => {
      const user = await createTotpUser(signUpUser.email);
      const mfaToken = await createMfaToken(user);

      // Codes that don't match /^\d{6}$/ are rejected by SDK validation
      const invalidCodes = ['', 'abc', '12345', '1234567', '123456789'];

      for (const code of invalidCodes) {
        const { error, response } = await call(signInWithTotp, {
          body: { code },
          headers: {
            ...defaultHeaders,
            Cookie: `${appConfig.slug}-confirm-mfa-${appConfig.cookieVersion}=${mfaToken}`,
          },
        });
        expect(error, `code=${JSON.stringify(code)}`).toBeInstanceOf(Error);
        expect(response).toBeUndefined();
      }
    });
  });
});
