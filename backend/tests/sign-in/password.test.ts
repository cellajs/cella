import { eq } from 'drizzle-orm';
import { signIn, signOut } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { passwordsTable } from '#/db/schema/passwords';
import { usersTable } from '#/db/schema/users';
import { mockEmail, mockPassword, mockUser } from '../../mocks/mock-user';
import { mockPastIsoDate } from '../../mocks/utils';
import { defaultHeaders, signUpUser } from '../fixtures';
import { createPasswordUser, type ErrorResponse, enableMFAForUser, verifyUserEmail } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

vi.mock('#/middlewares/rate-limiter/core', async () => (await import('../test-utils')).rateLimiterCoreMock());
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) =>
  (await import('../test-utils')).rateLimiterHelpersMock(importOriginal),
);
vi.mock('#/modules/auth/general/helpers/send-verification-email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

setTestConfig({ enabledAuthStrategies: ['password'] });

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearDatabase();
});

describe('Password Authentication', async () => {
  const call = await createAppClient();

  describe('Successful Authentication', () => {
    it('should sign in with valid credentials and verified email', async () => {
      // Create and verify a user
      await createPasswordUser(signUpUser.email, signUpUser.password);
      await verifyUserEmail(signUpUser.email);

      const { response: res, data } = await call(signIn, { body: signUpUser, headers: defaultHeaders });

      expect(res.status).toBe(200);
      expect((data as { emailVerified: boolean }).emailVerified).toBe(true);

      // Check session cookie is set
      const setCookieHeader = res.headers.get('set-cookie');
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);
    });

    it('should redirect to email verification for unverified email', async () => {
      // Create user without verifying email
      await createPasswordUser(signUpUser.email, signUpUser.password, false);

      const { response: res, data } = await call(signIn, { body: signUpUser, headers: defaultHeaders });

      expect(res.status).toBe(200);
      expect((data as { emailVerified: boolean }).emailVerified).toBe(false);
    });

    it('should redirect to MFA when user has MFA enabled', async () => {
      // Create user with MFA enabled
      const user = await createPasswordUser(signUpUser.email, signUpUser.password);
      await verifyUserEmail(signUpUser.email);
      await enableMFAForUser(user.id);

      const { response: res, data } = await call(signIn, { body: signUpUser, headers: defaultHeaders });

      expect(res.status).toBe(200);
      expect((data as { emailVerified: boolean; mfa: boolean }).emailVerified).toBe(true);
      expect((data as { emailVerified: boolean; mfa: boolean }).mfa).toBe(true);
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

      const { response: res, data } = await call(signIn, { body: uppercaseEmail, headers: defaultHeaders });

      expect(res.status).toBe(200);
      expect((data as { emailVerified: boolean }).emailVerified).toBe(true);
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

      const { response: res, error } = await call(signIn, { body: wrongPassword, headers: defaultHeaders });

      expect(res.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('invalid_password');
    });

    it('should reject signin for non-existent user', async () => {
      const nonExistentUser = {
        email: 'nonexistent@example.com',
        password: 'somePassword123!',
      };

      const { response: res, error } = await call(signIn, { body: nonExistentUser, headers: defaultHeaders });

      expect(res.status).toBe(404);
      expect((error as ErrorResponse).type).toBe('not_found');
    });

    it('should reject signin for user without password', async () => {
      // Create user without password (OAuth user) using mock helpers
      const userRecord = mockUser({ email: signUpUser.email });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      await db.insert(emailsTable).values(mockEmail(user));

      const { response: res, error } = await call(signIn, { body: signUpUser, headers: defaultHeaders });

      expect(res.status).toBe(403);
      expect((error as ErrorResponse).type).toBe('no_password_found');
    });

    it('should reject signin with malformed email', async () => {
      const malformedEmail = {
        email: 'invalid-email',
        password: signUpUser.password,
      };

      const { response: res, error } = await call(signIn, { body: malformedEmail, headers: defaultHeaders });

      expect(res.status).toBe(403); // Zod validation errors return 403
      expect((error as ErrorResponse).type).toBe('form.invalid_format');
    });

    it('should reject signin with missing fields', async () => {
      const missingPassword = {
        email: signUpUser.email,
        password: '', // Empty password
      };

      const { response: res, error } = await call(signIn, { body: missingPassword, headers: defaultHeaders });

      expect(res.status).toBe(403); // Zod validation errors return 403
      expect((error as ErrorResponse).type).toBe('form.too_small');
    });

    it('should reject signin with empty fields', async () => {
      const emptyFields = {
        email: '',
        password: '',
      };

      const { response: res } = await call(signIn, { body: emptyFields, headers: defaultHeaders });

      expect(res.status).toBe(403); // Zod validation errors return 403
    });
  });

  describe('Input Validation', () => {
    it('should handle very long email address', async () => {
      const longEmail = {
        email: 'a'.repeat(300) + '@example.com',
        password: signUpUser.password,
      };

      const { response: res } = await call(signIn, { body: longEmail, headers: defaultHeaders });

      expect(res.status).toBe(404); // User not found (email passes validation but user doesn't exist)
    });

    it('should handle very long password', async () => {
      const longPassword = {
        email: signUpUser.email,
        password: 'a'.repeat(1000),
      };

      const { response: res, error } = await call(signIn, { body: longPassword, headers: defaultHeaders });

      expect(res.status).toBe(403); // Zod validation error for password too long
      expect((error as ErrorResponse).type).toBe('form.too_big');
    });
  });

  describe('Configuration & Feature Flags', () => {
    it('should reject signin when password strategy is disabled', async () => {
      setTestConfig({ enabledAuthStrategies: [] });
      onTestFinished(() => setTestConfig({ enabledAuthStrategies: ['password'] }));

      const { response: res, error } = await call(signIn, { body: signUpUser, headers: defaultHeaders });

      // When strategy is disabled, it might return 400 or 404 depending on implementation
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) {
        expect((error as ErrorResponse).type).toBe('forbidden_strategy');
      }
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
        createdAt: mockPastIsoDate(),
      });

      // First signin should redirect to verification
      const { response: firstRes, data: firstData } = await call(signIn, { body: signUpUser, headers: defaultHeaders });

      expect(firstRes.status).toBe(200);
      expect((firstData as { emailVerified: boolean }).emailVerified).toBe(false);

      // Verify the email
      await db
        .update(emailsTable)
        .set({ verified: true, verifiedAt: mockPastIsoDate() })
        .where(eq(emailsTable.email, signUpUser.email.toLowerCase()));

      // Second signin should succeed
      const { response: secondRes, data: secondData } = await call(signIn, {
        body: signUpUser,
        headers: defaultHeaders,
      });

      expect(secondRes.status).toBe(200);
      expect((secondData as { emailVerified: boolean }).emailVerified).toBe(true);
    });

    it('should maintain session integrity across multiple requests', async () => {
      // Create and verify user
      await createPasswordUser(signUpUser.email, signUpUser.password);
      await verifyUserEmail(signUpUser.email);

      // Sign in
      const { response: signinRes } = await call(signIn, { body: signUpUser, headers: defaultHeaders });

      expect(signinRes.status).toBe(200);

      // Extract session cookie
      const setCookieHeader = signinRes.headers.get('set-cookie');
      expect(setCookieHeader).toBeDefined();

      // Make authenticated request (sign-out to test session)
      const { response: protectedRes } = await call(signOut, {
        headers: {
          ...defaultHeaders,
          Cookie: setCookieHeader || '',
        },
      });

      // Should succeed if session is valid (sign-out returns 204)
      expect(protectedRes.status).toBe(204);
    });
  });
});
