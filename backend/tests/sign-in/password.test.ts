import { appConfig } from 'config';
import { eq } from 'drizzle-orm';
import { testClient } from 'hono/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { passwordsTable } from '#/db/schema/passwords';
import { usersTable } from '#/db/schema/users';
import { mockEmail, mockPassword, mockUser } from '../../mocks/basic';
import { pastIsoDate } from '../../mocks/utils';
import { defaultHeaders, signUpUser } from '../fixtures';
import { createPasswordUser, ErrorResponse, enableMFAForUser, parseResponse, verifyUserEmail } from '../helpers';
import { clearDatabase, migrateDatabase, mockFetchRequest, mockRateLimiter, setTestConfig } from '../setup';

setTestConfig({ enabledAuthStrategies: ['password'] });

beforeAll(async () => {
  mockFetchRequest();
  await migrateDatabase();

  // Mock the sendVerificationEmail function to avoid background running tasks
  vi.mock('#/modules/auth/general/helpers/send-verification-email', () => ({
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  }));

  // Mock rate limiter to avoid 429 errors in tests
  mockRateLimiter();
});

afterEach(async () => {
  await clearDatabase();
});

describe('Password Authentication', async () => {
  const { default: app } = await import('#/routes');
  const client = testClient(app);

  describe('Successful Authentication', () => {
    it('should sign in with valid credentials and verified email', async () => {
      // Create and verify a user
      await createPasswordUser(signUpUser.email, signUpUser.password);
      await verifyUserEmail(signUpUser.email);

      const res = await client['auth']['sign-in'].$post({ json: signUpUser }, { headers: defaultHeaders });

      expect(res.status).toBe(200);
      const response = await parseResponse<{ emailVerified: boolean }>(res);
      expect(response.emailVerified).toBe(true);

      // Check session cookie is set
      const setCookieHeader = res.headers.get('set-cookie');
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);
    });

    it('should redirect to email verification for unverified email', async () => {
      // Create user without verifying email
      await createPasswordUser(signUpUser.email, signUpUser.password, false);

      const res = await client['auth']['sign-in'].$post({ json: signUpUser }, { headers: defaultHeaders });

      expect(res.status).toBe(200);
      const response = await parseResponse<{ emailVerified: boolean }>(res);
      expect(response.emailVerified).toBe(false);
    });

    it('should redirect to MFA when user has MFA enabled', async () => {
      // Create user with MFA enabled
      const user = await createPasswordUser(signUpUser.email, signUpUser.password);
      await verifyUserEmail(signUpUser.email);
      await enableMFAForUser(user.id);

      const res = await client['auth']['sign-in'].$post({ json: signUpUser }, { headers: defaultHeaders });

      expect(res.status).toBe(200);
      const response = await parseResponse<{ emailVerified: boolean; mfa: boolean }>(res);
      expect(response.emailVerified).toBe(true);
      expect(response.mfa).toBe(true);
    });

    it('should handle case-insensitive email signin', async () => {
      // Create user with lowercase email
      await createPasswordUser(signUpUser.email, signUpUser.password);
      await verifyUserEmail(signUpUser.email);

      // Try signin with uppercase email
      const uppercaseEmail = {
        email: signUpUser.email.toUpperCase(),
        password: signUpUser.password,
      };

      const res = await client['auth']['sign-in'].$post({ json: uppercaseEmail }, { headers: defaultHeaders });

      expect(res.status).toBe(200);
      const response = await parseResponse<{ emailVerified: boolean }>(res);
      expect(response.emailVerified).toBe(true);
    });
  });

  describe('Authentication Errors', () => {
    it('should reject signin with wrong password', async () => {
      await createPasswordUser(signUpUser.email, signUpUser.password);
      await verifyUserEmail(signUpUser.email);

      const wrongPassword = {
        email: signUpUser.email,
        password: 'wrongPassword123!',
      };

      const res = await client['auth']['sign-in'].$post({ json: wrongPassword }, { headers: defaultHeaders });

      expect(res.status).toBe(403);
      const error = await parseResponse<ErrorResponse>(res);
      expect(error.type).toBe('invalid_password');
    });

    it('should reject signin for non-existent user', async () => {
      const nonExistentUser = {
        email: 'nonexistent@cella.com',
        password: 'somePassword123!',
      };

      const res = await client['auth']['sign-in'].$post({ json: nonExistentUser }, { headers: defaultHeaders });

      expect(res.status).toBe(404);
      const error = (await res.json()) as { type: string };
      expect(error.type).toBe('not_found');
    });

    it('should reject signin for user without password', async () => {
      // Create user without password (OAuth user) using mock helpers
      const userRecord = mockUser({ email: signUpUser.email });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      await db.insert(emailsTable).values(mockEmail(user));

      const res = await client['auth']['sign-in'].$post({ json: signUpUser }, { headers: defaultHeaders });

      expect(res.status).toBe(403);
      const error = (await res.json()) as { type: string };
      expect(error.type).toBe('no_password_found');
    });

    it('should reject signin with malformed email', async () => {
      const malformedEmail = {
        email: 'invalid-email',
        password: signUpUser.password,
      };

      const res = await client['auth']['sign-in'].$post({ json: malformedEmail }, { headers: defaultHeaders });

      expect(res.status).toBe(403); // Zod validation errors return 403
      const error = await parseResponse<ErrorResponse>(res);
      expect(error.type).toBe('form.invalid_format');
    });

    it('should reject signin with missing fields', async () => {
      const missingPassword = {
        email: signUpUser.email,
        password: '', // Empty password
      };

      const res = await client['auth']['sign-in'].$post({ json: missingPassword }, { headers: defaultHeaders });

      expect(res.status).toBe(403); // Zod validation errors return 403
      const error = await parseResponse<ErrorResponse>(res);
      expect(error.type).toBe('form.too_small');
    });

    it('should reject signin with empty fields', async () => {
      const emptyFields = {
        email: '',
        password: '',
      };

      const res = await client['auth']['sign-in'].$post({ json: emptyFields }, { headers: defaultHeaders });

      expect(res.status).toBe(403); // Zod validation errors return 403
    });
  });

  describe('Input Validation', () => {
    it('should handle very long email address', async () => {
      const longEmail = {
        email: 'a'.repeat(300) + '@cella.com',
        password: signUpUser.password,
      };

      const res = await client['auth']['sign-in'].$post({ json: longEmail }, { headers: defaultHeaders });

      expect(res.status).toBe(404); // User not found (email passes validation but user doesn't exist)
    });

    it('should handle very long password', async () => {
      const longPassword = {
        email: signUpUser.email,
        password: 'a'.repeat(1000),
      };

      const res = await client['auth']['sign-in'].$post({ json: longPassword }, { headers: defaultHeaders });

      expect(res.status).toBe(403); // Zod validation error for password too long
      const error = (await res.json()) as { type: string };
      expect(error.type).toBe('form.too_big');
    });
  });

  describe('Configuration & Feature Flags', () => {
    it('should reject signin when password strategy is disabled', async () => {
      // Temporarily disable password strategy
      setTestConfig({ enabledAuthStrategies: [] });

      const res = await client['auth']['sign-in'].$post({ json: signUpUser }, { headers: defaultHeaders });

      // When strategy is disabled, it might return 400 or 404 depending on implementation
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) {
        const error = (await res.json()) as { type: string };
        expect(error.type).toBe('forbidden_strategy');
      }

      // Re-enable for other tests
      setTestConfig({ enabledAuthStrategies: ['password'] });
    });
  });

  describe('Integration & Edge Cases', () => {
    it('should handle signin after email verification', async () => {
      // Create unverified user
      const { hashPassword } = await import('#/modules/auth/passwords/helpers/argon2id');
      const hashed = await hashPassword(signUpUser.password);
      const userRecord = mockUser({ email: signUpUser.email });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      // Create password record
      const passwordRecord = mockPassword(user, hashed);
      await db.insert(passwordsTable).values(passwordRecord);

      // Create UNVERIFIED email record
      await db.insert(emailsTable).values({
        email: user.email,
        userId: user.id,
        verified: false,
        verifiedAt: null,
        createdAt: pastIsoDate(),
      });

      // First signin should redirect to verification
      const firstRes = await client['auth']['sign-in'].$post({ json: signUpUser }, { headers: defaultHeaders });

      expect(firstRes.status).toBe(200);
      const firstResponse = await parseResponse<{ emailVerified: boolean }>(firstRes);
      expect(firstResponse.emailVerified).toBe(false);

      // Verify the email
      await db.update(emailsTable).set({ verified: true, verifiedAt: pastIsoDate() }).where(eq(emailsTable.email, signUpUser.email.toLowerCase()));

      // Second signin should succeed
      const secondRes = await client['auth']['sign-in'].$post({ json: signUpUser }, { headers: defaultHeaders });

      expect(secondRes.status).toBe(200);
      const secondResponse = await parseResponse<{ emailVerified: boolean }>(secondRes);
      expect(secondResponse.emailVerified).toBe(true);
    });

    it('should maintain session integrity across multiple requests', async () => {
      // Create and verify user
      await createPasswordUser(signUpUser.email, signUpUser.password);
      await verifyUserEmail(signUpUser.email);

      // Sign in
      const signinRes = await client['auth']['sign-in'].$post({ json: signUpUser }, { headers: defaultHeaders });

      expect(signinRes.status).toBe(200);

      // Extract session cookie
      const setCookieHeader = signinRes.headers.get('set-cookie');
      expect(setCookieHeader).toBeDefined();

      // Make authenticated request (sign-out to test session)
      const protectedRes = await client['auth']['sign-out'].$post(
        {},
        {
          headers: {
            ...defaultHeaders,
            Cookie: setCookieHeader || '',
          },
        },
      );

      // Should succeed if session is valid (sign-out returns 204)
      expect(protectedRes.status).toBe(204);
    });
  });
});
