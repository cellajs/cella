import { and, eq } from 'drizzle-orm';
import { generateRandomCodeVerifier, generateRandomState } from 'oauth4webapi';
import { github, githubCallback, google, googleCallback, invokeToken, microsoft, microsoftCallback } from 'sdk';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { getParsedSessionCookie } from '#/modules/auth/general/helpers/session';
import { identitiesTable } from '#/modules/auth/identities-db';
import { githubAuth, googleAuth, microsoftAuth } from '#/modules/auth/oauth/helpers/providers';
import { tokensTable } from '#/modules/auth/tokens-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { createUser, linkIdentity } from '../helpers';
import { createAppClient } from '../test-client';
import { clearCookieStore, clearDatabase, mockCookieStore, mockFetchRequest, setTestConfig } from '../test-utils';

vi.mock('oauth4webapi', async () => (await import('../test-utils')).oauth4webapiMock());

setTestConfig({
  enabledAuthStrategies: ['oauth'],
  enabledOAuthProviders: ['github', 'google', 'microsoft'],
  selfRegistration: true,
});

vi.mock('#/modules/auth/oauth/helpers/providers', () => ({
  githubAuth: {
    createAuthorizationURL: vi.fn().mockReturnValue(new URL('https://github.com/login/oauth/authorize')),
    validateAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: 'mock-access-token' }),
  },
  googleAuth: {
    createAuthorizationURL: vi.fn().mockReturnValue(new URL('https://accounts.google.com/o/oauth2/v2.0/auth')),
    validateAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: 'mock-access-token' }),
  },
  microsoftAuth: {
    createAuthorizationURL: vi
      .fn()
      .mockReturnValue(new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')),
    validateAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: 'mock-access-token' }),
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
vi.mock('#/lib/mailer', () => ({ mailer: { prepareEmails: vi.fn().mockResolvedValue(undefined) } }));

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

      const state = generateRandomState();
      const url = await githubAuth.createAuthorizationURL(state, ['user:email']);

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toBe(url.href);
    });

    it('should initiate Google OAuth flow', async () => {
      const { response: res } = await call(google, { query: { type: 'auth' }, headers: defaultHeaders });

      const state = generateRandomState();
      const codeVerifier = generateRandomCodeVerifier();
      const url = await googleAuth.createAuthorizationURL(state, ['profile', 'email'], { codeVerifier });

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toBe(url.href);
    });

    it('should initiate Microsoft OAuth flow', async () => {
      const { response: res } = await call(microsoft, { query: { type: 'auth' }, headers: defaultHeaders });

      const state = generateRandomState();
      const codeVerifier = generateRandomCodeVerifier();
      const url = await microsoftAuth.createAuthorizationURL(state, ['profile', 'email'], { codeVerifier });

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
      const setCookieHeader = res.headers.get('set-cookie');
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain(`"redirectAfter":"${redirectAfter}"`);
    });
  });

  describe('OAuth Callback - Existing User Sign-In', () => {
    it('should sign in existing user with linked OAuth account', async () => {
      const userEmail = 'github-user@example.com';
      const user = await createUser(userEmail);

      await linkIdentity(user);

      const state = 'mock-state-test';
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

    it('finds the identity by provider subject when the provider address changed, and refreshes the snapshot', async () => {
      const user = await createUser('local-account@example.com');
      const identity = await linkIdentity(user, { email: 'old-address@example.com' });

      const state = 'mock-state-test';
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const { response: res } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('set-cookie')).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);

      const [used] = await db.select().from(identitiesTable).where(eq(identitiesTable.id, identity.id));
      expect(used.email).toBe('github-user@example.com');
      expect(used.lastUsedAt).not.toBeNull();
      // The snapshot is display only: no email row appears for it.
      expect(await db.select().from(emailsTable).where(eq(emailsTable.email, 'github-user@example.com'))).toHaveLength(
        0,
      );
    });

    it('never matches an identity of another kind that shares the issuer slug and subject', async () => {
      const user = await createUser('local-account@example.com');
      const ssoIdentity = await linkIdentity(user, { kind: 'sso' });

      const state = 'mock-state-test';
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const { response: res } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      // The callback treats the GitHub user as new: no session as the SSO identity's user, and that identity is untouched.
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/auth/email-verification');
      expect(res.headers.get('set-cookie') ?? '').not.toContain(`${appConfig.slug}-session-`);
      const [untouched] = await db.select().from(identitiesTable).where(eq(identitiesTable.id, ssoIdentity.id));
      expect(untouched.lastUsedAt).toBeNull();
      expect(untouched.userId).toBe(user.id);
    });

    // Signed out, the provider holder has not shown they own the account: its verification mail goes only to the
    // account's own address. Otherwise a sign-up identity (created from an address the provider never verified) could
    // later be pointed at the holder's inbox and verified into the account of whoever proved that address meanwhile.
    it("must not move an unverified identity's verification to another address via a signed-out sign-in", async () => {
      const user = await createUser('local-account@example.com');
      const identity = await linkIdentity(user, { verified: false, email: user.email });

      const state = 'mock-state-test';
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const { response: res, error } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(409);
      expect((error as { type: string }).type).toBe('oauth_conflict');
      expect(res.headers.get('set-cookie') ?? '').not.toContain(`${appConfig.slug}-session-`);
      expect(await db.select().from(tokensTable).where(eq(tokensTable.identityId, identity.id))).toHaveLength(0);
      const [unchanged] = await db.select().from(identitiesTable).where(eq(identitiesTable.id, identity.id));
      expect(unchanged).toMatchObject({ email: 'local-account@example.com', verified: false });
    });

    it("mails the verification to the account's own address, refreshing a stale snapshot (positive control)", async () => {
      const user = await createUser('github-user@example.com');
      const identity = await linkIdentity(user, { verified: false, email: 'old-address@example.com' });

      const state = 'mock-state-test';
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const { response: res } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/auth/email-verification');
      const [token] = await db.select().from(tokensTable).where(eq(tokensTable.identityId, identity.id));
      expect(token.email).toBe('github-user@example.com');
      const [refreshed] = await db.select().from(identitiesTable).where(eq(identitiesTable.id, identity.id));
      expect(refreshed.email).toBe('github-user@example.com');
    });

    it('should redirect to email verification for unverified OAuth account', async () => {
      setTestConfig({ selfRegistration: false });
      onTestFinished(() => setTestConfig({ selfRegistration: true }));

      const userEmail = 'github-user@example.com';
      const user = await createUser(userEmail);

      await linkIdentity(user, { verified: false });

      const state = 'mock-state-test';
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
    // GHSA-g38m-r43w-p2q7 (nOAuth-class): an OAuth sign-in whose email matches an existing
    // local user must not link or authenticate that account.
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

  describe('Connect flow', () => {
    const state = 'mock-state-connect';
    const providerEmail = 'github-user@example.com';

    const connectCallback = (connectUserId?: string) => {
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'connect', connectUserId }));
      return call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });
    };

    it('links a provider account on another address without making that address a user email', async () => {
      const user = await createUser('local-account@example.com');

      const { response: res } = await connectCallback(user.id);

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/auth/email-verification/connect');

      const [oauthAccount] = await db.select().from(identitiesTable).where(eq(identitiesTable.userId, user.id));
      expect(oauthAccount).toMatchObject({ kind: 'oauth', issuer: 'github', email: providerEmail, verified: false });

      // Identity is the provider subject: the provider address stays on the OAuth account.
      expect(await db.select().from(emailsTable).where(eq(emailsTable.email, providerEmail))).toHaveLength(0);
    });

    it('refuses when another user holds the provider address', async () => {
      const user = await createUser('local-account@example.com');
      await createUser(providerEmail);

      const { response: res, error } = await connectCallback(user.id);

      expect(res.status).toBe(409);
      expect((error as { type: string }).type).toBe('oauth_conflict');
      expect(await db.select().from(identitiesTable)).toHaveLength(0);
    });

    it('refuses a provider account already linked to another user', async () => {
      const user = await createUser('local-account@example.com');
      const other = await createUser('other-account@example.com');
      await linkIdentity(other, { email: providerEmail });

      const { response: res, error } = await connectCallback(user.id);

      expect(res.status).toBe(409);
      expect((error as { type: string }).type).toBe('oauth_conflict');
    });

    it('requires the connecting user pinned at initiation', async () => {
      const { response: res } = await connectCallback(undefined);

      expect(res.status).toBe(401);
    });
  });

  describe('Verify flow: the click on the verification mail proves the inbox', () => {
    const state = 'mock-state-verify';
    const providerEmail = 'github-user@example.com';

    /** A connected-but-unverified GitHub account on another address, with the mailed single-use token in hand. */
    const connectedUnverified = async () => {
      const user = await createUser('local-account@example.com');
      const oauthAccount = await linkIdentity(user, { verified: false, email: providerEmail });

      const rawSingleUse = nanoid(40);
      const [token] = await db
        .insert(tokensTable)
        .values({
          secret: hashToken(nanoid(40)),
          singleUseToken: hashToken(rawSingleUse),
          type: 'oauth-verification',
          email: providerEmail,
          userId: user.id,
          identityId: oauthAccount.id,
          createdBy: user.id,
          invokedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        })
        .returning();
      mockCookieStore.set('oauth-verification', rawSingleUse);
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'verify', tokenId: token.id }));

      return { user, oauthAccount };
    };

    it('adds the provider address to the account as a proven inbox', async () => {
      const { user, oauthAccount } = await connectedUnverified();

      const { response: res } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      const [verifiedAccount] = await db.select().from(identitiesTable).where(eq(identitiesTable.id, oauthAccount.id));
      expect(verifiedAccount.verified).toBe(true);

      const [row] = await db.select().from(emailsTable).where(eq(emailsTable.email, providerEmail));
      expect(row).toMatchObject({ userId: user.id, verified: true, lastVerifiedVia: 'github' });
      // The primary is untouched.
      const [primary] = await db.select().from(emailsTable).where(eq(emailsTable.email, 'local-account@example.com'));
      expect(primary.userId).toBe(user.id);
    });

    it('refuses when another account took the address after the connect started', async () => {
      const { user } = await connectedUnverified();
      await createUser(providerEmail);

      const { response: res, error } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(409);
      expect((error as { type: string }).type).toBe('oauth_conflict');
      const [row] = await db.select().from(emailsTable).where(eq(emailsTable.email, providerEmail));
      expect(row.userId).not.toBe(user.id);
    });
  });

  describe('Open-redirect regression (pre-validation redirect removed)', () => {
    // GHSA-36rg-gfq2-3h56 / GHSA-vp58-j275-797x: the callback rejects a
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

  describe('Verified redirect honors only validated same-origin paths', () => {
    const linkVerifiedAccount = async () => {
      const userEmail = 'github-user@example.com';
      const user = await createUser(userEmail);
      await linkIdentity(user);
      return user;
    };

    it('should honor a valid redirectAfter on a verified OAuth sign-in', async () => {
      await linkVerifiedAccount();

      const state = 'mock-state-test';
      mockCookieStore.set(
        `oauth-state-${state}`,
        JSON.stringify({ type: 'auth', redirectAfter: '/orgs/acme?tab=files', codeVerifier: undefined }),
      );

      const { response: res } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(`${appConfig.frontendUrl}/orgs/acme?tab=files`);
    });

    // An attacker-controlled redirectAfter must never become the Location.
    it('should redirect a verified OAuth sign-in to a frontend path, not an attacker redirectAfter', async () => {
      await linkVerifiedAccount();

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

      await linkIdentity(user);

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

      await linkIdentity(user);

      const state = 'mock-state-test';
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));

      const { response: signinRes } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });

      expect(signinRes.status).toBe(302);

      const setCookieHeader = signinRes.headers.get('set-cookie');
      expect(setCookieHeader).toBeTruthy();
      expect(setCookieHeader).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);

      const sessionCookiePattern = new RegExp(`${appConfig.slug}-session-${appConfig.cookieVersion}=([^;]+)`);
      const match = setCookieHeader?.match(sessionCookiePattern);
      expect(match).toBeTruthy();
      expect(match![1]).toBeTruthy();
      expect(match![1].length).toBeGreaterThan(0);
    });
  });
  describe('Sign-up: no account before the inbox is proven', () => {
    const providerEmail = 'github-user@example.com';
    const verifyState = 'mock-state-verify-sign-up';

    const signUpCallback = () => {
      const state = 'mock-state-sign-up';
      mockCookieStore.set(`oauth-state-${state}`, JSON.stringify({ type: 'auth', codeVerifier: undefined }));
      return call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });
    };

    /** The raw token at the end of the verification link in the last mail handed to the mailer. */
    const mailedVerificationToken = () => {
      const statics = vi.mocked(mailer.prepareEmails).mock.lastCall?.[1] as { verificationLink?: string } | undefined;
      const rawToken = statics?.verificationLink?.split('/').at(-1) ?? '';
      expect(rawToken).not.toBe('');
      return rawToken;
    };

    /** Opens the verification link in a signed-out browser, which keeps its single-use cookie. */
    const openVerificationLink = async (rawToken: string) => {
      vi.mocked(getParsedSessionCookie).mockRejectedValueOnce(new Error('no session'));
      return call(invokeToken, { path: { type: 'oauth-verification', token: rawToken }, headers: defaultHeaders });
    };

    /** The provider's callback for the verify round trip, in the browser that opened the link. */
    const verifyCallback = () => {
      mockCookieStore.set(`oauth-state-${verifyState}`, JSON.stringify({ type: 'verify' }));
      return call(githubCallback, { query: { state: verifyState, code: 'mock-auth-code' }, headers: defaultHeaders });
    };

    const accountsFor = (email: string) => db.select().from(usersTable).where(eq(usersTable.email, email));
    const verificationTokens = () => db.select().from(tokensTable).where(eq(tokensTable.type, 'oauth-verification'));

    it('must not create an account via an OAuth sign-up whose address is unproven', async () => {
      const { response: res } = await signUpCallback();

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/auth/email-verification/signup');
      expect(res.headers.get('set-cookie') ?? '').not.toContain(`${appConfig.slug}-session-`);
      expect(await accountsFor(providerEmail)).toHaveLength(0);
      expect(await db.select().from(emailsTable).where(eq(emailsTable.email, providerEmail))).toHaveLength(0);
      expect(await db.select().from(identitiesTable)).toHaveLength(0);

      // The sign-up waits on the verification token alone.
      expect(await verificationTokens()).toEqual([
        expect.objectContaining({
          email: providerEmail,
          userId: null,
          identityId: null,
          pendingSignUp: expect.objectContaining({ issuer: 'github', subject: 'github-user-id' }),
        }),
      ]);
    });

    it('creates the account once the mailed link and the same provider account prove it (positive control)', async () => {
      await signUpCallback();
      const opened = await openVerificationLink(mailedVerificationToken());
      expect(opened.response.status).toBe(302);
      const verifyStart = new URL(opened.response.headers.get('location') ?? '');
      expect(`${verifyStart.origin}${verifyStart.pathname}`).toBe(`${appConfig.backendAuthUrl}/github`);
      expect(verifyStart.searchParams.get('type')).toBe('verify');
      expect(await accountsFor(providerEmail)).toHaveLength(0);

      // The verify round trip starts where the link redirected, which pins its state in this browser.
      const statesBefore = new Set(mockCookieStore.keys());
      const started = await call(github, { query: { type: 'verify' }, headers: defaultHeaders });
      expect(started.response.status).toBe(302);
      const stateKey = [...mockCookieStore.keys()].find(
        (key) => key.startsWith('oauth-state-') && !statesBefore.has(key),
      );
      const state = stateKey?.replace('oauth-state-', '') ?? '';

      const { response: res } = await call(githubCallback, {
        query: { state, code: 'mock-auth-code' },
        headers: defaultHeaders,
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('set-cookie')).toContain(`${appConfig.slug}-session-${appConfig.cookieVersion}=`);

      const [account] = await accountsFor(providerEmail);
      expect(account).toBeDefined();
      const [address] = await db.select().from(emailsTable).where(eq(emailsTable.email, providerEmail));
      expect(address).toMatchObject({ userId: account.id, verified: true, lastVerifiedVia: 'github' });
      const [identity] = await db.select().from(identitiesTable).where(eq(identitiesTable.userId, account.id));
      expect(identity).toMatchObject({ issuer: 'github', subject: 'github-user-id', verified: true });
      // The verification is spent with the sign-up.
      expect(await verificationTokens()).toHaveLength(0);
    });

    it('must not complete an OAuth sign-up via another provider account', async () => {
      await signUpCallback();
      await openVerificationLink(mailedVerificationToken());

      const { transformGithubUserData } = await import('#/modules/auth/oauth/helpers/transform-user-data');
      vi.mocked(transformGithubUserData).mockReturnValueOnce({
        id: 'another-github-user-id',
        slug: 'someone',
        email: providerEmail,
        name: 'Someone',
        emailVerified: true,
        thumbnailUrl: 'https://avatar.url',
        firstName: 'Some',
        lastName: 'One',
      });

      const { response: res, error } = await verifyCallback();
      expect(res.status).toBe(400);
      expect((error as { type: string }).type).toBe('oauth_failed');
      expect(await accountsFor(providerEmail)).toHaveLength(0);
      expect(await db.select().from(identitiesTable)).toHaveLength(0);
    });

    it('must not complete an OAuth sign-up in a browser that did not open the mailed link', async () => {
      await signUpCallback();

      const { response: res, error } = await verifyCallback();
      expect(res.status).toBe(400);
      expect((error as { type: string }).type).toBe('invalid_token');
      expect(await accountsFor(providerEmail)).toHaveLength(0);
      expect(await verificationTokens()).toHaveLength(1);
    });

    it('refuses to complete a sign-up when an account took the address meanwhile', async () => {
      await signUpCallback();
      await openVerificationLink(mailedVerificationToken());
      const holder = await createUser(providerEmail);

      const { response: res, error } = await verifyCallback();
      expect(res.status).toBe(409);
      expect((error as { type: string }).type).toBe('oauth_email_exists');
      expect((await accountsFor(providerEmail)).map((user) => user.id)).toEqual([holder.id]);
      expect(await db.select().from(identitiesTable)).toHaveLength(0);
    });

    it('keeps one live sign-up per provider account', async () => {
      await signUpCallback();
      await signUpCallback();

      const tokens = await db
        .select()
        .from(tokensTable)
        .where(and(eq(tokensTable.type, 'oauth-verification'), eq(tokensTable.email, providerEmail)));
      expect(tokens).toHaveLength(1);
    });
  });
});
