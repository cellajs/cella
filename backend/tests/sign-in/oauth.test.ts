import { generateCodeVerifier, generateState } from 'arctic';
import { eq } from 'drizzle-orm';
import { github, githubCallback, google, googleCallback, microsoft, microsoftCallback } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mockPastIsoDate } from '#/mocks';
import { githubAuth, googleAuth, microsoftAuth } from '#/modules/auth/oauth/helpers/providers';
import { oauthAccountsTable } from '#/modules/auth/oauth/oauth-accounts-db';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders } from '../fixtures';
import { createUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearCookieStore, clearDatabase, mockCookieStore, mockFetchRequest, setTestConfig } from '../test-utils';

vi.mock('arctic', async () => (await import('../test-utils')).arcticMock());

setTestConfig({
  enabledAuthStrategies: ['oauth'],
  enabledOAuthProviders: ['github', 'google', 'microsoft'],
  selfRegistration: true,
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
vi.mock('#/modules/auth/general/helpers/cookie', async () => (await import('../test-utils')).cookieMock());
vi.mock('#/modules/auth/general/helpers/session', async () => (await import('../test-utils')).sessionMock());

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearDatabase();
  vi.clearAllMocks();
  clearCookieStore();
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
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

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
      setTestConfig({ selfRegistration: false });
      onTestFinished(() => setTestConfig({ selfRegistration: true }));

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
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

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
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const { response: res, error } = await call(githubCallback, {
        query: { state, code: 'error-code', error: 'access_denied', error_description: 'User denied access' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(400);
      expect((error as { type: string }).type).toBe('oauth_failed');
    });

    it('should reject callback with missing code', async () => {
      const state = 'mock-state-test';
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

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

  describe('Account-linking safety (no implicit linking)', () => {
    // GHSA-g38m-r43w-p2q7 (nOAuth-class): an OAuth sign-in whose email matches an
    // existing local user MUST NOT silently link/authenticate that account.
    it('should refuse OAuth sign-in when the email matches an existing local user without a linked account', async () => {
      // Local user owns the email, but there is NO linked OAuth account.
      await createUser('github-user@example.com');

      const state = 'mock-state-test';
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const { response: res, error } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(409);
      expect((error as { type: string }).type).toBe('oauth_email_exists');
    });
  });

  describe('Open-redirect regression (pre-validation redirect removed)', () => {
    // GHSA-36rg-gfq2-3h56 / GHSA-vp58-j275-797x: the callback must never honor a
    // redirect destination smuggled inside the OAuth `state` before validation.
    it('should not honor a redirectUrl embedded in the OAuth state', async () => {
      const malicious = { redirectUrl: 'https://evil.example' };
      const state = Buffer.from(JSON.stringify(malicious)).toString('base64');

      const { response: res, error } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      // No matching state cookie → fail closed; never redirect to the attacker host.
      expect(res.status).toBe(401);
      expect((error as { type: string }).type).toBe('invalid_state');
      expect(res.headers.get('location') ?? '').not.toContain('evil.example');
    });
  });

  describe('PKCE binding', () => {
    // GHSA-wxw3-q3m9-c3jr / GHSA-9h47-pqcx-hjr4: PKCE providers must reject a
    // callback whose stored state has no code verifier.
    it.each([
      { name: 'google', fn: googleCallback },
      { name: 'microsoft', fn: microsoftCallback },
    ])('should reject $name callback when codeVerifier is missing from the state cookie', async ({ fn }) => {
      const state = 'mock-state-test';
      // Cookie present, but WITHOUT a PKCE code verifier.
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth' }));

      const { response: res, error } = await call(fn, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(401);
      expect((error as { type: string }).type).toBe('invalid_state');
    });
  });

  describe('Verified redirect ignores client-supplied destination', () => {
    // The verified sign-in redirect is server-determined; an attacker-controlled
    // redirectAfter must not become the Location.
    it('should redirect a verified OAuth sign-in to a frontend path, not an attacker redirectAfter', async () => {
      const userEmail = 'github-user@example.com';
      const user = await createUser(userEmail);
      await db.insert(oauthAccountsTable).values({
        userId: user.id,
        provider: 'github' as const,
        providerUserId: 'github-user-id',
        email: userEmail,
        verified: true,
        createdAt: mockPastIsoDate(),
      });

      const state = 'mock-state-test';
      mockCookieStore.set(
        `oauth-state-${state}`,
        JSON.stringify({ type: 'auth', redirectAfter: '//evil.example', codeVerifier: undefined }),
      );

      const { response: res } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toBeTruthy();
      expect(location).not.toContain('evil.example');
      expect(location!.startsWith(appConfig.frontendUrl)).toBe(true);
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
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const { response: res } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toContain('/auth/mfa');

      // GHSA-xg6x-h9c9-2m83: no session may be issued before the second factor completes.
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).not.toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);
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
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      // Sign in with OAuth
      const { response: signinRes } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(signinRes.status).toBe(302);

      // Extract session cookie and verify it was set correctly
      const setCookieHeader = signinRes.headers.get('set-cookie');
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);

      // Verify session cookie contains a session token value
      const sessionCookiePattern = new RegExp(`${appConfig.slug}-session-${appConfig.cookieVersion}=([^;]+)`);
      const match = setCookieHeader?.match(sessionCookiePattern);
      expect(match).toBeTruthy();
      expect(match![1]).toBeTruthy();
      expect(match![1].length).toBeGreaterThan(0);
    });
  });
});
