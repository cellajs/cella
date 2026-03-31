import { generateCodeVerifier, generateState } from 'arctic';
import { eq } from 'drizzle-orm';
import { github, githubCallback, google, microsoft, signOut } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { usersTable } from '#/db/schema/users';
import { githubAuth, googleAuth, microsoftAuth } from '#/modules/auth/oauth/helpers/providers';
import { mockPastIsoDate } from '../../mocks/utils';
import { defaultHeaders } from '../fixtures';
import { createUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

vi.mock('arctic', async () => (await import('../test-utils')).arcticMock());
vi.mock('#/middlewares/rate-limiter/core', async () => (await import('../test-utils')).rateLimiterCoreMock());
vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) =>
  (await import('../test-utils')).rateLimiterHelpersMock(importOriginal),
);

// Mock cookies storage for OAuth state handling
const mockCookies = new Map<string, string>();

setTestConfig({
  enabledAuthStrategies: ['oauth'],
  enabledOAuthProviders: ['github', 'google', 'microsoft'],
  registrationEnabled: true,
});

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
vi.mock('#/modules/auth/oauth/helpers/transform-user-data', () => ({
  transformGithubUserData: vi.fn().mockReturnValue({
    id: 'github-user-id',
    slug: 'testuser',
    email: 'github-user@example.com',
    name: 'Test User',
    emailVerified: true,
    thumbnailUrl: 'https://avatar.url',
    firstName: 'Test',
    lastName: 'User',
  }),
  transformSocialUserData: vi.fn().mockImplementation((userData) => ({
    id: userData.id || 'google-user-id',
    slug: 'testuser',
    email: userData.email || 'google-user@example.com',
    name: userData.name || 'Test User',
    emailVerified: true,
    thumbnailUrl: userData.picture || 'https://avatar.url',
    firstName: userData.given_name || 'Test',
    lastName: userData.family_name || 'User',
  })),
}));
vi.mock('#/modules/auth/general/helpers/cookie', () => ({
  setAuthCookie: vi.fn().mockImplementation(async (ctx, name, value, _maxAge) => {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    mockCookies.set(name, stringValue);
    const existingCookies = ctx.res.headers.get('set-cookie') || '';
    const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;
    const newCookie = `${versionedName}=${stringValue}; Path=/; HttpOnly; SameSite=Lax`;
    ctx.res.headers.set('set-cookie', existingCookies ? `${existingCookies}, ${newCookie}` : newCookie);
  }),
  getAuthCookie: vi.fn().mockImplementation(async (_ctx, name) => {
    return mockCookies.get(name) || null;
  }),
  deleteAuthCookie: vi.fn().mockImplementation(async (ctx, name) => {
    mockCookies.delete(name);
    const existingCookies = ctx.res.headers.get('set-cookie') || '';
    const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;
    const deleteCookie = `${versionedName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    ctx.res.headers.set('set-cookie', existingCookies ? `${existingCookies}, ${deleteCookie}` : deleteCookie);
  }),
}));
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

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearDatabase();
  vi.clearAllMocks();

  // Clear mock cookies
  mockCookies.clear();
});

describe('OAuth Authentication', async () => {
  const call = await createAppClient();

  describe('OAuth Flow Initiation', () => {
    it('should initiate GitHub OAuth flow', async () => {
      const { response: res } = await call(github, { query: { type: 'auth' }, headers: defaultHeaders });

      const state = generateState();
      const url = githubAuth.createAuthorizationURL(state, ['user:email']);

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toBe(url.href);
    });

    it('should initiate Google OAuth flow', async () => {
      const { response: res } = await call(google, { query: { type: 'auth' }, headers: defaultHeaders });

      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const url = googleAuth.createAuthorizationURL(state, codeVerifier, ['profile', 'email']);

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toBe(url.href);
    });

    it('should initiate Microsoft OAuth flow', async () => {
      const { response: res } = await call(microsoft, { query: { type: 'auth' }, headers: defaultHeaders });

      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const url = microsoftAuth.createAuthorizationURL(state, codeVerifier, ['profile', 'email']);

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toBe(url.href);
    });

    it('should handle OAuth flow with redirect parameter', async () => {
      const redirectAfter = '/dashboard';
      const { response: res } = await call(github, {
        query: { type: 'auth', redirectAfter },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      // Should set oauth-redirect cookie
      const setCookieHeader = res.headers.get('set-cookie');
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain(`"redirectAfter":"${redirectAfter}"`);
    });
  });

  describe('OAuth Callback - Existing User Sign-In', () => {
    it('should sign in existing user with linked OAuth account', async () => {
      const userEmail = 'github-user@example.com';
      const user = await createUser(userEmail);

      // Create linked OAuth account
      const oauthAccount = {
        userId: user.id,
        provider: 'github' as const,
        providerUserId: 'github-user-id',
        email: userEmail,
        verified: true,
        createdAt: mockPastIsoDate(),
      };
      await db.insert(oauthAccountsTable).values(oauthAccount);

      const state = 'mock-state-test';
      // Set up the state cookie manually for the test
      mockCookies.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const { response: res } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      const setCookieHeader = res.headers.get('set-cookie');
      expect(setCookieHeader).toBeDefined();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);
    });

    it('should redirect to email verification for unverified OAuth account', async () => {
      setTestConfig({ registrationEnabled: false });
      onTestFinished(() => setTestConfig({ registrationEnabled: true }));

      const userEmail = 'github-user@example.com';
      const user = await createUser(userEmail);

      // Create unverified OAuth account
      const oauthAccount = {
        userId: user.id,
        provider: 'github' as const,
        providerUserId: 'github-user-id',
        email: userEmail,
        verified: false,
        createdAt: mockPastIsoDate(),
      };
      await db.insert(oauthAccountsTable).values(oauthAccount);

      const state = 'mock-state-test';
      // Set up the state cookie manually for the test
      mockCookies.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const { response: res } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toContain('/auth/email-verification');
    });
  });

  describe('OAuth Callback Error Handling', () => {
    it('should reject callback with invalid state', async () => {
      const { response: res, error } = await call(githubCallback, {
        query: { state: 'invalid-state', code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(401);
      expect((error as { type: string }).type).toBe('invalid_state');
    });

    it('should reject callback with OAuth error', async () => {
      const state = 'mock-state-test';
      mockCookies.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const { response: res, error } = await call(githubCallback, {
        query: { state, code: 'error-code', error: 'access_denied', error_description: 'User denied access' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(400);
      expect((error as { type: string }).type).toBe('oauth_failed');
    });

    it('should reject callback with missing code', async () => {
      const state = 'mock-state-test';
      mockCookies.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const { response: res, error } = await call(githubCallback, {
        query: { state, code: '' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(400);
      expect((error as { type: string }).type).toBe('oauth_failed');
    });
  });

  describe('Security & Input Validation', () => {
    it('should handle very long redirect URL', async () => {
      const longRedirect = 'a'.repeat(2000);
      const { response: res } = await call(github, {
        query: { type: 'auth', redirectAfter: longRedirect },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
    });

    it('should handle malformed state parameter', async () => {
      const malformedState = '../../etc/passwd';
      const { response: res, error } = await call(githubCallback, {
        query: { state: malformedState, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(401);
      expect((error as { type: string }).type).toBe('invalid_state');
    });
  });

  describe('Integration & Edge Cases', () => {
    it('should handle OAuth flow with MFA enabled user', async () => {
      const userEmail = 'github-user@example.com';
      const user = await createUser(userEmail);
      await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, user.id));

      // Create linked OAuth account
      const oauthAccount = {
        userId: user.id,
        provider: 'github' as const,
        providerUserId: 'github-user-id',
        email: userEmail,
        verified: true,
        createdAt: mockPastIsoDate(),
      };
      await db.insert(oauthAccountsTable).values(oauthAccount);

      const state = 'mock-state-test';
      mockCookies.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const { response: res } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toContain('/auth/mfa');
    });

    it('should maintain session integrity across OAuth signin', async () => {
      const userEmail = 'github-user@example.com';
      const user = await createUser(userEmail);

      // Create verified OAuth account with matching data
      const oauthAccount = {
        userId: user.id,
        provider: 'github' as const,
        providerUserId: 'github-user-id',
        email: userEmail,
        verified: true,
        createdAt: mockPastIsoDate(),
      };
      await db.insert(oauthAccountsTable).values(oauthAccount);

      const state = 'mock-state-test';
      mockCookies.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      // Sign in with OAuth
      const { response: signinRes } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(signinRes.status).toBe(302);

      // Extract session cookie
      const setCookieHeader = signinRes.headers.get('set-cookie');
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);

      // Make authenticated request (sign-out to test session)
      const { response: protectedRes } = await call(signOut, {
        headers: { ...defaultHeaders, Cookie: setCookieHeader || '' },
      });

      // Should succeed if session is valid (sign-out returns 204)
      expect(protectedRes.status).toBe(204);
    });
  });
});
