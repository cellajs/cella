import { eq } from 'drizzle-orm';
import { testClient } from 'hono/testing';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { tokensTable } from '#/db/schema/tokens';
import { totpsTable } from '#/db/schema/totps';
import { nanoid } from '#/utils/nanoid';
import { encodeLowerCased } from '#/utils/oslo';
import { pastIsoDate } from '../../mocks/utils';
import { defaultHeaders, signUpUser } from '../fixtures';
import { createPasswordUser, enableMFAForUser, parseResponse, verifyUserEmail } from '../helpers';
import { clearDatabase, mockFetchRequest, mockRateLimiter, setTestConfig } from '../test-utils';

setTestConfig({ enabledAuthStrategies: ['password', 'totp'] });

beforeAll(async () => {
  mockFetchRequest();

  // Mock sendVerificationEmail function to avoid background running tasks
  vi.mock('#/modules/auth/general/helpers/send-verification-email', () => ({
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  }));

  // Mock rate limiter to avoid 429 errors in tests
  mockRateLimiter();

  // Mock TOTP functions
  vi.mock('#/modules/auth/totps/helpers/totps', () => ({
    validateTOTP: vi.fn().mockResolvedValue(true),
    signInWithTotp: vi.fn().mockReturnValue(true),
  }));
});

afterEach(async () => {
  await clearDatabase();
  vi.clearAllMocks();
});

describe('TOTP Authentication', async () => {
  const { default: app } = await import('#/routes');
  const client = testClient(app);

  describe('TOTP Setup', () => {
    it('should generate TOTP key for authenticated user', async () => {
      // Create and verify a user
      await createPasswordUser(signUpUser.email, signUpUser.password);
      await verifyUserEmail(signUpUser.email);

      // Get authenticated session
      const signInRes = await client['auth']['sign-in'].$post({ json: signUpUser }, { headers: defaultHeaders });

      expect(signInRes.status).toBe(200);
      const sessionCookie = signInRes.headers.get('set-cookie');

      // Request TOTP key generation
      const res = await client['auth']['totp']['generate-key'].$post(
        {},
        { headers: { ...defaultHeaders, Cookie: sessionCookie || '' } },
      );

      expect(res.status).toBe(200);
      const response = await parseResponse<{ totpUri: string; manualKey: string }>(res);
      expect(response.totpUri).toBeTruthy();
      expect(response.manualKey).toBeTruthy();
      expect(response.manualKey).toMatch(/^[A-Z2-7]+=*$/); // Base32 format
    });

    it('should create TOTP for user with valid code', async () => {
      // Create and verify a user
      const user = await createPasswordUser(signUpUser.email, signUpUser.password);
      await verifyUserEmail(signUpUser.email);

      // Get authenticated session
      const signInRes = await client['auth']['sign-in'].$post({ json: signUpUser }, { headers: defaultHeaders });
      expect(signInRes.status).toBe(200);

      const sessionCookie = signInRes.headers.get('set-cookie');

      // First generate TOTP key
      const generateRes = await client['auth']['totp']['generate-key'].$post(
        {},
        { headers: { ...defaultHeaders, Cookie: sessionCookie || '' } },
      );

      expect(generateRes.status).toBe(200);

      // Get totp-challenge cookie from generate response
      const generateCookies = generateRes.headers.get('set-cookie');
      const allCookies = [sessionCookie, generateCookies].filter(Boolean).join('; ');

      // Create TOTP with verification code
      const createRes = await client['auth']['totp'].$post(
        { json: { code: '123456' } },
        { headers: { ...defaultHeaders, Cookie: allCookies } },
      );

      expect(createRes.status).toBe(201);

      // Verify TOTP was created in database
      const totpRecord = await db.select().from(totpsTable).where(eq(totpsTable.userId, user.id));
      expect(totpRecord).toHaveLength(1);
      expect(totpRecord[0].secret).toBeTruthy();
    });
  });

  describe('TOTP Sign-In Flow', () => {
    it('should sign in with valid TOTP code', async () => {
      // Create and verify a user
      const user = await createPasswordUser(signUpUser.email, signUpUser.password);
      await verifyUserEmail(signUpUser.email);

      // Set up TOTP for user
      await db.insert(totpsTable).values({
        userId: user.id,
        secret: 'JBSWY3DPEHPK3PXP',
        createdAt: pastIsoDate(),
      });

      // Enable MFA for user
      await enableMFAForUser(user.id);

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

      // Sign in with TOTP
      const res = await client['auth']['totp-verification'].$post(
        { json: { code: '123456' } },
        {
          headers: {
            ...defaultHeaders,
            Cookie: `${appConfig.slug}-confirm-mfa-${appConfig.cookieVersion}=${mfaToken}`,
          },
        },
      );

      expect(res.status).toBe(204);
      const setCookieHeader = res.headers.get('set-cookie');
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);
    });

    it('should reject invalid TOTP code', async () => {
      // Create and verify a user
      const user = await createPasswordUser(signUpUser.email, signUpUser.password);
      await verifyUserEmail(signUpUser.email);

      // Set up TOTP for user
      await db.insert(totpsTable).values({
        userId: user.id,
        secret: 'JBSWY3DPEHPK3PXP',
        createdAt: pastIsoDate(),
      });

      // Enable MFA for user
      await enableMFAForUser(user.id);

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

      // Mock TOTP validation to fail
      const { validateTOTP } = await import('#/modules/auth/totps/helpers/totps');
      vi.mocked(validateTOTP).mockRejectedValueOnce(new Error('Invalid TOTP code'));

      // Try to sign in with invalid TOTP code
      const res = await client['auth']['totp-verification'].$post(
        { json: { code: '000000' } },
        {
          headers: {
            ...defaultHeaders,
            Cookie: `${appConfig.slug}-confirm-mfa-${appConfig.cookieVersion}=${mfaToken}`,
          },
        },
      );

      expect(res.status).toBe(500);
    });

    it('should reject TOTP verification for non-existent user', async () => {
      const res = await client['auth']['totp-verification'].$post(
        { json: { code: '123456' } },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(401);
      const response = await parseResponse<{ type: string }>(res);
      expect(response.type).toBe('confirm-mfa_not_found');
    });

    it('should reject TOTP verification for user without TOTP', async () => {
      // Create and verify a user without TOTP
      const user = await createPasswordUser(signUpUser.email, signUpUser.password);
      await verifyUserEmail(signUpUser.email);

      // Enable MFA for user (but no TOTP set up)
      await enableMFAForUser(user.id);

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

      // Mock validateTOTP to throw 404 error (no TOTP found)
      const { validateTOTP } = await import('#/modules/auth/totps/helpers/totps');
      vi.mocked(validateTOTP).mockRejectedValueOnce(new Error('TOTP not found'));

      const res = await client['auth']['totp-verification'].$post(
        { json: { code: '123456' } },
        {
          headers: {
            ...defaultHeaders,
            Cookie: `${appConfig.slug}-confirm-mfa-${appConfig.cookieVersion}=${mfaToken}`,
          },
        },
      );

      expect(res.status).toBe(500);
    });
  });

  describe('TOTP Security', () => {
    it('should handle malformed TOTP codes', async () => {
      // Create and verify a user
      const user = await createPasswordUser(signUpUser.email, signUpUser.password);
      await verifyUserEmail(signUpUser.email);

      // Set up TOTP for user
      await db.insert(totpsTable).values({
        userId: user.id,
        secret: 'JBSWY3DPEHPK3PXP',
        createdAt: pastIsoDate(),
      });

      // Enable MFA for user
      await enableMFAForUser(user.id);

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

      // Test various malformed codes
      const invalidCodes = [
        { code: '', expected: 403 }, // Empty string - passes schema but fails TOTP validation
        { code: 'abc', expected: 403 }, // Non-digits - passes schema but fails TOTP validation
        { code: '12345', expected: 403 }, // Too short - passes schema but fails TOTP validation
        { code: '1234567', expected: 403 }, // Too long - passes schema but fails TOTP validation
        { code: '123456789', expected: 403 }, // Too long - passes schema but fails TOTP validation
      ];

      for (const { code, expected } of invalidCodes) {
        const res = await client['auth']['totp-verification'].$post(
          { json: { code } },
          {
            headers: {
              ...defaultHeaders,
              Cookie: `${appConfig.slug}-confirm-mfa-${appConfig.cookieVersion}=${mfaToken}`,
            },
          },
        );

        expect(res.status).toBe(expected);
      }
    });
  });
});
