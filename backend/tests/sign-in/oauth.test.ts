import { generateCodeVerifier, generateState } from 'arctic';
import { eq } from 'drizzle-orm';
import { testClient } from 'hono/testing';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { unsafeInternalDb as db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { usersTable } from '#/db/schema/users';
import { githubAuth, googleAuth, microsoftAuth } from '#/modules/auth/oauth/helpers/providers';
import { mockEmail, mockUser } from '../../mocks/mock-user';
import { pastIsoDate } from '../../mocks/utils';
import { defaultHeaders } from '../fixtures';
import { parseResponse } from '../helpers';
import { clearDatabase, mockArcticLibrary, mockFetchRequest, mockRateLimiter, setTestConfig } from '../test-utils';

mockArcticLibrary();

// Mock cookies storage for OAuth state handling
const mockCookies = new Map<string, string>();

setTestConfig({
  enabledAuthStrategies: ['oauth'],
  enabledOAuthProviders: ['github', 'google', 'microsoft'],
  registrationEnabled: true,
});

beforeAll(async () => {
  mockFetchRequest();

  // Mock rate limiter to avoid 429 errors in tests
  mockRateLimiter();

  // Mock OAuth providers
  vi.mock('#/modules/auth/oauth/helpers/providers', () => ({
    githubAuth: {
      createAuthorizationURL: vi.fn().mockReturnValue(new URL('https://github.com/login/oauth/authorize')),
      validateAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: () => 'mock-access-token' }),
    },
    googleAuth: {
      createAuthorizationURL: vi.fn().mockReturnValue(new URL('https://accounts.google.com/o/oauth2/v2.0/auth')),
      validateAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: () => 'mock-access-token' }),
    },
    microsoftAuth: {
      createAuthorizationURL: vi
        .fn()
        .mockReturnValue(new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')),
      validateAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: () => 'mock-access-token' }),
    },
  }));

  // Mock user data transformation
  vi.mock('#/modules/auth/oauth/helpers/transform-user-data', () => ({
    transformGithubUserData: vi.fn().mockReturnValue({
      id: 'github-user-id',
      slug: 'testuser',
      email: 'github-user@cella.com',
      name: 'Test User',
      emailVerified: true,
      thumbnailUrl: 'https://avatar.url',
      firstName: 'Test',
      lastName: 'User',
    }),
    transformSocialUserData: vi.fn().mockImplementation((userData) => ({
      id: userData.id || 'google-user-id',
      slug: 'testuser',
      email: userData.email || 'google-user@cella.com',
      name: userData.name || 'Test User',
      emailVerified: true,
      thumbnailUrl: userData.picture || 'https://avatar.url',
      firstName: userData.given_name || 'Test',
      lastName: userData.family_name || 'User',
    })),
  }));

  // Mock the getAuthCookie function for OAuth state handling
  vi.mock('#/modules/auth/general/helpers/cookie', () => ({
    setAuthCookie: vi.fn().mockImplementation(async (ctx, name, value, _maxAge) => {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      mockCookies.set(name, stringValue);

      // Simulate setting cookie header on response with proper naming
      const existingCookies = ctx.res.headers.get('set-cookie') || '';
      // Use the same naming convention as the real cookie helper
      const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;
      const newCookie = `${versionedName}=${stringValue}; Path=/; HttpOnly; SameSite=Lax`;
      ctx.res.headers.set('set-cookie', existingCookies ? `${existingCookies}, ${newCookie}` : newCookie);
    }),
    getAuthCookie: vi.fn().mockImplementation(async (_ctx, name) => {
      return mockCookies.get(name) || null;
    }),
    deleteAuthCookie: vi.fn().mockImplementation(async (ctx, name) => {
      mockCookies.delete(name);

      // Simulate deleting cookie by setting expired cookie
      const existingCookies = ctx.res.headers.get('set-cookie') || '';
      const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;
      const deleteCookie = `${versionedName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      ctx.res.headers.set('set-cookie', existingCookies ? `${existingCookies}, ${deleteCookie}` : deleteCookie);
    }),
  }));

  // Mock the session helper to set session cookies
  vi.mock('#/modules/auth/general/helpers/session', () => ({
    setUserSession: vi.fn().mockImplementation(async (ctx, _user, _provider) => {
      const sessionToken = 'mock-session-token';
      const existingCookies = ctx.res.headers.get('set-cookie') || '';
      const sessionCookie = `${appConfig.slug}-session-${appConfig.cookieVersion}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax`;
      ctx.res.headers.set('set-cookie', existingCookies ? `${existingCookies}, ${sessionCookie}` : sessionCookie);
      return sessionToken;
    }),
    getParsedSessionCookie: vi.fn().mockResolvedValue({ sessionToken: 'mock-session-token' }),
    validateSession: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' }, session: { id: 'test-session-id' } }),
  }));
});

afterEach(async () => {
  await clearDatabase();
  vi.clearAllMocks();

  // Clear mock cookies
  mockCookies.clear();
});

describe('OAuth Authentication', async () => {
  const { default: app } = await import('#/routes');
  const client = testClient(app);

  describe('OAuth Flow Initiation', () => {
    it('should initiate GitHub OAuth flow', async () => {
      const res = await client['auth']['github'].$get({ query: { type: 'auth' } }, { headers: defaultHeaders });

      const state = generateState();
      const url = githubAuth.createAuthorizationURL(state, ['user:email']);

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toBe(url.href);
    });

    it('should initiate Google OAuth flow', async () => {
      const res = await client['auth']['google'].$get({ query: { type: 'auth' } }, { headers: defaultHeaders });

      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const url = googleAuth.createAuthorizationURL(state, codeVerifier, ['profile', 'email']);

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toBe(url.href);
    });

    it('should initiate Microsoft OAuth flow', async () => {
      const res = await client['auth']['microsoft'].$get({ query: { type: 'auth' } }, { headers: defaultHeaders });

      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const url = microsoftAuth.createAuthorizationURL(state, codeVerifier, ['profile', 'email']);

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toBe(url.href);
    });

    it('should handle OAuth flow with redirect parameter', async () => {
      const redirectAfter = '/dashboard';
      const res = await client['auth']['github'].$get(
        { query: { type: 'auth', redirectAfter } },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(302);
      // Should set oauth-redirect cookie
      const setCookieHeader = res.headers.get('set-cookie');
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain(`"redirectAfter":"${redirectAfter}"`);
    });
  });

  describe('OAuth Callback - Existing User Sign-In', () => {
    it('should sign in existing user with linked OAuth account', async () => {
      // Create user with the same email that the OAuth mock returns
      const userEmail = 'github-user@cella.com';
      const userRecord = mockUser({ email: userEmail });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      await db.insert(emailsTable).values(mockEmail(user));

      // Create linked OAuth account
      const oauthAccount = {
        userId: user.id,
        provider: 'github' as const,
        providerUserId: 'github-user-id',
        email: userEmail,
        verified: true,
        createdAt: pastIsoDate(),
      };
      await db.insert(oauthAccountsTable).values(oauthAccount);

      const state = 'mock-state-test';
      // Set up the state cookie manually for the test
      mockCookies.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const res = await client['auth']['github']['callback'].$get(
        {
          query: {
            state,
            code: 'mock-auth-code',
          },
        },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(302);
      const setCookieHeader = res.headers.get('set-cookie');
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);
    });

    it('should redirect to email verification for unverified OAuth account', async () => {
      // Temporarily disable registration to test existing user behavior
      setTestConfig({ registrationEnabled: false });

      // Use the same email as the OAuth mock returns
      const userEmail = 'github-user@cella.com';

      // Create user
      const userRecord = mockUser({ email: userEmail });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      await db.insert(emailsTable).values(mockEmail(user));

      // Create unverified OAuth account
      const oauthAccount = {
        userId: user.id,
        provider: 'github' as const,
        providerUserId: 'github-user-id',
        email: userEmail,
        verified: false,
        createdAt: pastIsoDate(),
      };
      await db.insert(oauthAccountsTable).values(oauthAccount);

      const state = 'mock-state-test';
      // Set up the state cookie manually for the test
      mockCookies.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const res = await client['auth']['github']['callback'].$get(
        { query: { state, code: 'mock-auth-code' } },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toContain('/auth/email-verification');

      // Restore original config
      setTestConfig({ registrationEnabled: true });
    });
  });

  describe('OAuth Callback Error Handling', () => {
    it('should reject callback with invalid state', async () => {
      const res = await client['auth']['github']['callback'].$get(
        {
          query: {
            state: 'invalid-state',
            code: 'mock-auth-code',
          },
        },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(401);
      const response = await parseResponse<{ type: string }>(res);
      expect(response.type).toBe('invalid_state');
    });

    it('should reject callback with OAuth error', async () => {
      const state = 'mock-state-test';
      mockCookies.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const res = await client['auth']['github']['callback'].$get(
        {
          query: {
            state,
            code: 'error-code',
            error: 'access_denied',
            error_description: 'User denied access',
          },
        },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(400);
      const response = await parseResponse<{ type: string }>(res);
      expect(response.type).toBe('oauth_failed');
    });

    it('should reject callback with missing code', async () => {
      const state = 'mock-state-test';
      mockCookies.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const res = await client['auth']['github']['callback'].$get(
        {
          query: {
            state,
            code: '',
          },
        },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(400);
      const response = await parseResponse<{ type: string }>(res);
      expect(response.type).toBe('oauth_failed');
    });
  });

  describe('Security & Input Validation', () => {
    it('should handle very long redirect URL', async () => {
      const longRedirect = 'a'.repeat(2000);
      const res = await client['auth']['github'].$get(
        { query: { type: 'auth', redirectAfter: longRedirect } },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(302);
    });

    it('should handle malformed state parameter', async () => {
      const malformedState = '../../etc/passwd';
      const res = await client['auth']['github']['callback'].$get(
        {
          query: {
            state: malformedState,
            code: 'mock-auth-code',
          },
        },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(401);
      const response = await parseResponse<{ type: string }>(res);
      expect(response.type).toBe('invalid_state');
    });
  });

  describe('Integration & Edge Cases', () => {
    it('should handle OAuth flow with MFA enabled user', async () => {
      // Create user with MFA enabled
      const userEmail = 'github-user@cella.com';
      const userRecord = mockUser({ email: userEmail });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      await db.insert(emailsTable).values(mockEmail(user));

      await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, user.id));

      // Create linked OAuth account
      const oauthAccount = {
        userId: user.id,
        provider: 'github' as const,
        providerUserId: 'github-user-id',
        email: userEmail,
        verified: true,
        createdAt: pastIsoDate(),
      };
      await db.insert(oauthAccountsTable).values(oauthAccount);

      const state = 'mock-state-test';
      mockCookies.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const res = await client['auth']['github']['callback'].$get(
        {
          query: {
            state,
            code: 'mock-auth-code',
          },
        },
        { headers: defaultHeaders },
      );

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toContain('/auth/mfa');
    });

    it('should maintain session integrity across OAuth signin', async () => {
      // Create a verified user and OAuth account for this test
      // Use the same email as the mock transformGithubUserData returns
      const userEmail = 'github-user@cella.com';
      const userRecord = mockUser({ email: userEmail });
      const [user] = await db.insert(usersTable).values(userRecord).returning();

      await db.insert(emailsTable).values(mockEmail(user));

      // Create verified OAuth account with matching data
      const oauthAccount = {
        userId: user.id,
        provider: 'github' as const,
        providerUserId: 'github-user-id',
        email: userEmail,
        verified: true,
        createdAt: pastIsoDate(),
      };
      await db.insert(oauthAccountsTable).values(oauthAccount);

      const state = 'mock-state-test';
      mockCookies.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      // Sign in with OAuth
      const signinRes = await client['auth']['github']['callback'].$get(
        {
          query: {
            state,
            code: 'mock-auth-code',
          },
        },
        { headers: defaultHeaders },
      );

      expect(signinRes.status).toBe(302);

      // Extract session cookie
      const setCookieHeader = signinRes.headers.get('set-cookie');
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);

      // Make authenticated request (sign-out to test session)
      const protectedRes = await client['auth']['sign-out'].$post(
        {},
        { headers: { ...defaultHeaders, Cookie: setCookieHeader || '' } },
      );

      // Should succeed if session is valid (sign-out returns 204)
      expect(protectedRes.status).toBe(204);
    });
  });
});
