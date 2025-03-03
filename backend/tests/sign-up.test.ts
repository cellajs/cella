import path from 'node:path';
import { config } from 'config';
import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import { tokensTable } from '../src/db/schema/tokens';
import { usersTable } from '../src/db/schema/users';
import routes from '../src/routes';

// Read the enabled authentication strategies from the config file
const enabledStrategies: readonly string[] = config.enabledAuthenticationStrategies;

// Ensure the DB schema is up-to-date
beforeAll(async () => await migrate(db, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') }));

// Clean up test data after all tests
afterAll(async () => await db.delete(usersTable).where(eq(usersTable.email, 'test@gmail.com')));

describe('Sign-up process', () => {
  // Sample test user details for sign-up tests
  const testUser = {
    email: 'test@gmail.com',
    password: 'password',
  };

  const requestDetails = {
    method: 'POST',
    credentials: 'include' as const,
    body: JSON.stringify(testUser),
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
  };

  it('should block request if no IP header is provided', async () => {
    // Test if request fails when no IP address is provided
    const res = await routes.request('/auth/sign-up', {
      ...requestDetails,
      headers: { 'Content-Type': 'application/json' }, // Omit 'x-forwarded-for'
    });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  // This test runs only if the "password" strategy is not enabled
  if (!enabledStrategies.includes('password')) {
    it('should not allow registration if "password" strategy is omitted', async () => {
      const res = await routes.request('/auth/sign-up', requestDetails);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.error.severity).toBe('warn');
    });
  }
  // This test runs only if the registration feature is disabled
  else if (!config.has.registrationEnabled) {
    it('should not allow, registration is disabled', async () => {
      const res = await routes.request('/auth/sign-up', requestDetails);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.error.severity).toBe('warn');
    });
  } else {
    // This block runs if all conditions are met for successful sign-up
    it('should successfully sign up a user when conditions are met', async () => {
      const signUp = await routes.request('/auth/sign-up', requestDetails);

      expect(signUp.status).toBe(200);
      const { success: signUpSuccess } = await signUp.json(); // Parse response to check success flag
      expect(signUpSuccess).toBe(true);

      // Verify that user was added to db
      const [user] = await db.select().from(usersTable).where(eq(usersTable.email, 'test@gmail.com'));
      expect(user).toBeDefined();

      // Send a request to trigger email verification process
      const tokenCreationRes = await routes.request('/auth/send-verification-email', {
        ...requestDetails,
        body: JSON.stringify({ userId: user.id }),
      });

      expect(tokenCreationRes.status).toBe(200);
      const { success: tokenCreationSuccess } = await tokenCreationRes.json(); // Parse response to check success flag
      expect(tokenCreationSuccess).toBe(true);

      // Retrieve verification token from db
      const [token] = await db
        .select()
        .from(tokensTable)
        .where(and(eq(tokensTable.userId, user.id), eq(tokensTable.type, 'email_verification')));
      expect(token).toBeDefined();

      // Request to verify user's email using token
      const emailVerifyRes = await routes.request(`/auth/verify-email/${token.token}`, requestDetails);

      expect(emailVerifyRes.status).toBe(200);
      const { success: emailVerifySuccess } = await emailVerifyRes.json(); // Parse response to check success flag
      expect(emailVerifySuccess).toBe(true);

      // Get Set-Cookie header from email verification response
      const cookies = emailVerifyRes.headers.get('set-cookie');
      expect(cookies).not.toBeNull();

      if (cookies) {
        const cookieName = `${config.slug}-session-${config.cookieVersion}`;
        // Look for  session cookie with a dynamic name based on config
        const sessionCookie = cookies.split(';').find((cookie) => cookie.startsWith(cookieName));
        expect(sessionCookie).toBeDefined();

        // TODO add  check token in table?
      }
    });

    it('should throw an error if the user already exists', async () => {
      // Trying to sign up the same user again should return conflict error
      const res = await routes.request('/auth/sign-up', requestDetails);

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.error.severity).toBe('warn');
    });
  }
});
