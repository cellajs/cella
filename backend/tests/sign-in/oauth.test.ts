import { and, eq } from 'drizzle-orm';
import { github, githubCallback, google, googleCallback, microsoft, microsoftCallback } from 'sdk';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { githubAuth, googleAuth, microsoftAuth, OAuthCodeExchangeError } from '#/modules/auth/oauth/helpers/providers';
import { identitiesTable } from '#/modules/auth/oauth/identities-db';
import { resolveSession } from '#/modules/auth/sessions/operations/resolve-session';
import { sessionsTable } from '#/modules/auth/sessions/sessions-db';
import { tokensTable } from '#/modules/auth/tokens/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders } from '../fixtures';
import {
  cookieChange,
  createTestOrganization,
  createTestUser,
  type ErrorResponse,
  expectRefusal,
  insertTestSession,
  insertTestToken,
  linkIdentity,
  mailedLink,
  mailsTo,
  membersOf,
  openHeldLink,
  setCookieOf,
} from '../helpers';
import { createInvitation } from '../invitations/helpers';
import { createAppClient } from '../test-client';
import { clearCookieStore, clearDatabase, mockCookieStore, setTestConfig } from '../test-utils';

vi.mock('oauth4webapi', async () => (await import('../test-utils')).oauth4webapiMock());

setTestConfig({ enabledAuthStrategies: ['oauth'], enabledOAuthProviders: ['github', 'google', 'microsoft'], selfRegistration: true });

vi.mock('#/modules/auth/oauth/helpers/providers', async (importOriginal) => ({
  OAuthCodeExchangeError: (await importOriginal<typeof import('#/modules/auth/oauth/helpers/providers')>()).OAuthCodeExchangeError,
  githubAuth: {
    configured: true,
    oidc: false,
    createAuthorizationURL: vi.fn().mockReturnValue(new URL('https://github.com/login/oauth/authorize')),
    validateAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: 'mock-access-token' }),
  },
  googleAuth: {
    configured: true,
    oidc: true,
    createAuthorizationURL: vi.fn().mockReturnValue(new URL('https://accounts.google.com/o/oauth2/v2.0/auth')),
    validateAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: 'mock-access-token', claims: {} }),
  },
  microsoftAuth: {
    configured: true,
    oidc: true,
    createAuthorizationURL: vi.fn().mockReturnValue(new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')),
    validateAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: 'mock-access-token', claims: {} }),
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
    givenName: 'Test',
    familyName: 'User',
  }),
  transformSocialUserData: vi.fn().mockImplementation((userData) => ({
    id: userData.id || 'google-user-id',
    slug: 'testuser',
    email: userData.email || 'google-user@example.com',
    name: userData.name || 'Test User',
    emailVerified: true,
    thumbnailUrl: userData.picture || 'https://avatar.url',
    givenName: userData.given_name || 'Test',
    familyName: userData.family_name || 'User',
  })),
}));
vi.mock('#/modules/auth/general/helpers/cookie', async () => (await import('../test-utils')).cookieMock());
vi.mock('#/modules/auth/sessions/operations/create-session', async (importOriginal) =>
  (await import('../test-utils')).createSessionMock(importOriginal),
);
vi.mock('#/modules/auth/sessions/operations/resolve-session', async (importOriginal) =>
  (await import('../test-utils')).resolveSessionMock(importOriginal),
);
afterEach(async () => {
  await clearDatabase();
  clearCookieStore();
});

describe('OAuth Authentication', async () => {
  const call = await createAppClient();

  describe('OAuth Flow Initiation', () => {
    // The state cookie must hold what the provider URL was built with: the callback presents that verifier and
    // nonce, so a mismatch would let a code minted for another challenge through, or fail every sign-in.
    it.each([
      { provider: 'github', fn: github, client: githubAuth, oidc: false },
      { provider: 'google', fn: google, client: googleAuth, oidc: true },
      { provider: 'microsoft', fn: microsoft, client: microsoftAuth, oidc: true },
    ])('starts a $provider round trip whose state cookie matches the provider URL', async ({ fn, client, oidc }) => {
      const { response: res } = await call(fn, { query: { type: 'auth' }, headers: defaultHeaders });

      expect(res.status).toBe(302);
      const [[state, , options]] = vi.mocked(client.createAuthorizationURL).mock.calls;
      const payload = JSON.parse(mockCookieStore.get('oauth-state') ?? 'null');
      expect(payload).toMatchObject({ state, type: 'auth' });
      expect(options.codeVerifier).toEqual(expect.any(String));
      expect(payload.codeVerifier).toBe(options.codeVerifier);
      // A nonce only where an id_token echoes it.
      expect(payload.nonce).toBe(options.nonce);
      expect(options.nonce).toEqual(oidc ? expect.any(String) : undefined);
    });

    it('should handle OAuth flow with redirect parameter', async () => {
      const redirectAfter = '/dashboard';
      const { response: res } = await call(github, { query: { type: 'auth', redirectAfter }, headers: defaultHeaders });

      expect(res.status).toBe(302);
      expect(setCookieOf(res, 'oauth-state').line).toContain(`"redirectAfter":"${redirectAfter}"`);
    });
  });

  describe('OAuth Callback - Existing User Sign-In', () => {
    it('should sign in existing user with linked OAuth account', async () => {
      const userEmail = 'github-user@example.com';
      const user = await createTestUser(userEmail);

      await linkIdentity(user);

      const state = 'mock-state-test';
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'auth', codeVerifier: 'verifier' }));

      const { response: res } = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

      expect(res.status).toBe(302);
      expect(cookieChange(res, 'session')).toBe('set');
    });

    it('finds the identity by provider subject when the provider address changed, and refreshes the snapshot', async () => {
      const user = await createTestUser('local-account@example.com');
      const identity = await linkIdentity(user, { email: 'old-address@example.com' });

      const state = 'mock-state-test';
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'auth', codeVerifier: 'verifier' }));

      const { response: res } = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

      expect(res.status).toBe(302);
      expect(cookieChange(res, 'session')).toBe('set');

      const [used] = await db.select().from(identitiesTable).where(eq(identitiesTable.id, identity.id));
      expect(used.email).toBe('github-user@example.com');
      expect(used.lastUsedAt).not.toBeNull();
      // The snapshot is display only: no email row appears for it.
      expect(await db.select().from(emailsTable).where(eq(emailsTable.email, 'github-user@example.com'))).toHaveLength(0);
    });

    it('never matches an identity of another kind that shares the issuer slug and subject', async () => {
      const user = await createTestUser('local-account@example.com');
      const ssoIdentity = await linkIdentity(user, { kind: 'sso' });

      const state = 'mock-state-test';
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'auth', codeVerifier: 'verifier' }));

      const { response: res } = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

      // The callback treats the GitHub user as new: no session as the SSO identity's user, and that identity is untouched.
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/auth/email-verification');
      expect(cookieChange(res, 'session')).toBeUndefined();
      const [untouched] = await db.select().from(identitiesTable).where(eq(identitiesTable.id, ssoIdentity.id));
      expect(untouched.lastUsedAt).toBeNull();
      expect(untouched.userId).toBe(user.id);
    });

    // Signed out, the provider holder has not shown they own the account: its verification mail goes only to the
    // account's own address. Otherwise a sign-up identity (created from an address the provider never verified) could
    // later be pointed at the holder's inbox and verified into the account of whoever proved that address meanwhile.
    it("must not move an unverified identity's verification to another address via a signed-out sign-in", async () => {
      const user = await createTestUser('local-account@example.com');
      const identity = await linkIdentity(user, { verified: false, email: user.email });

      const state = 'mock-state-test';
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'auth', codeVerifier: 'verifier' }));

      const { response: res, error } = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

      await expectRefusal({ response: res, error }, 409, 'oauth_conflict');
      expect(cookieChange(res, 'session')).toBeUndefined();
      expect(await db.select().from(tokensTable).where(eq(tokensTable.identityId, identity.id))).toHaveLength(0);
      const [unchanged] = await db.select().from(identitiesTable).where(eq(identitiesTable.id, identity.id));
      expect(unchanged).toMatchObject({ email: 'local-account@example.com', verified: false });
    });

    it("mails the verification to the account's own address, refreshing a stale snapshot (positive control)", async () => {
      const user = await createTestUser('github-user@example.com');
      const identity = await linkIdentity(user, { verified: false, email: 'old-address@example.com' });

      const state = 'mock-state-test';
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'auth', codeVerifier: 'verifier' }));

      const { response: res } = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/auth/email-verification');
      const [token] = await db.select().from(tokensTable).where(eq(tokensTable.identityId, identity.id));
      expect(token.email).toBe('github-user@example.com');
      const [refreshed] = await db.select().from(identitiesTable).where(eq(identitiesTable.id, identity.id));
      expect(refreshed.email).toBe('github-user@example.com');
      // An identity on an account reads as connecting, under the provider's name.
      expect(mailsTo('github-user@example.com').at(-1)?.statics).toMatchObject({ isNewUser: false, providerName: 'GitHub' });
    });

    it('should redirect to email verification for unverified OAuth account', async () => {
      setTestConfig({ selfRegistration: false });
      onTestFinished(() => setTestConfig({ selfRegistration: true }));

      const userEmail = 'github-user@example.com';
      const user = await createTestUser(userEmail);

      await linkIdentity(user, { verified: false });

      const state = 'mock-state-test';
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'auth', codeVerifier: 'verifier' }));

      const { response: res } = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

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

      await expectRefusal({ response: res, error }, 401, 'invalid_state');
    });

    it('should reject callback with OAuth error', async () => {
      const state = 'mock-state-test';
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'auth', codeVerifier: 'verifier' }));

      const { response: res, error } = await call(githubCallback, {
        query: { state, code: 'error-code', error: 'access_denied', error_description: 'User denied access' },
        headers: defaultHeaders,
      });

      await expectRefusal({ response: res, error }, 400, 'oauth_failed');
    });

    // A provider denial carries `error` and `state` but no `code` (RFC 6749 §4.1.2.1).
    it.each([
      { name: 'github', fn: githubCallback },
      { name: 'google', fn: googleCallback },
      { name: 'microsoft', fn: microsoftCallback },
    ])('refuses a $name denial that arrives without a code as oauth_failed', async ({ name, fn }) => {
      const state = 'mock-state-denied';
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: name, type: 'auth', codeVerifier: 'verifier' }));

      const { response: res, error } = await call(fn, {
        query: { state, error: 'access_denied', error_description: 'User denied access' },
        headers: defaultHeaders,
      });

      await expectRefusal({ response: res, error }, 400, 'oauth_failed');
    });

    it('should reject callback with missing code', async () => {
      const state = 'mock-state-test';
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'auth', codeVerifier: 'verifier' }));

      const { response: res, error } = await call(githubCallback, { query: { state, code: '' }, headers: defaultHeaders });

      await expectRefusal({ response: res, error }, 400, 'oauth_failed');
    });
  });

  describe('Security & Input Validation', () => {
    it('should handle very long redirect URL', async () => {
      const longRedirect = `/${'a'.repeat(2000)}`;
      const { response: res } = await call(github, { query: { type: 'auth', redirectAfter: longRedirect }, headers: defaultHeaders });

      expect(res.status).toBe(302);
      // A path the last hop would refuse is dropped at the start, so it never grows the state cookie past what a browser keeps.
      expect(JSON.parse(mockCookieStore.get('oauth-state') ?? '{}').redirectAfter).toBeUndefined();
    });
  });

  describe('Account-linking safety (no implicit linking)', () => {
    // GHSA-g38m-r43w-p2q7 (nOAuth-class): an OAuth sign-in whose email matches an existing
    // local user must not link or authenticate that account.
    it('should refuse OAuth sign-in when the email matches an existing local user without a linked account', async () => {
      // Local user owns the email, but there is NO linked OAuth account.
      await createTestUser('github-user@example.com');

      const state = 'mock-state-test';
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'auth', codeVerifier: 'verifier' }));

      const { response: res, error } = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

      await expectRefusal({ response: res, error }, 409, 'oauth_email_exists');
    });
  });

  describe('Connect flow', () => {
    const state = 'mock-state-connect';
    const providerEmail = 'github-user@example.com';

    /**
     * The pin startOAuthConnect leaves: a token row for the user and the session that asked, and its raw value in this
     * browser's cookie. Returns that session's id.
     */
    const pinConnect = async (user: { id: string; email: string }) => {
      const { id: sessionId } = await insertTestSession(user, { expiresInMs: 60 * 60 * 1000 });
      const pin = await insertTestToken('oauth-connect', user, { sessionId, expiresInMs: 10 * 60 * 1000 });
      mockCookieStore.set('oauth-connect', pin.raw);
      return sessionId;
    };

    const connectCallback = (payload: Record<string, unknown> = {}) => {
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'connect', codeVerifier: 'verifier', ...payload }));
      return call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });
    };

    const identitiesOf = (userId: string) => db.select().from(identitiesTable).where(eq(identitiesTable.userId, userId));

    it('links a provider account on another address without making that address a user email', async () => {
      const user = await createTestUser('local-account@example.com');
      await pinConnect(user);

      const { response: res } = await connectCallback();

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/auth/email-verification/connect');

      const [oauthAccount] = await db.select().from(identitiesTable).where(eq(identitiesTable.userId, user.id));
      expect(oauthAccount).toMatchObject({ kind: 'oauth', issuer: 'github', email: providerEmail, verified: false });

      // Identity is the provider subject: the provider address stays on the OAuth account.
      expect(await db.select().from(emailsTable).where(eq(emailsTable.email, providerEmail))).toHaveLength(0);
    });

    it("sends a provider's refusal of a connect back to the account page, with the error to show", async () => {
      const denied = () => {
        // Each callback reads, and so ends, the round trip its state cookie holds.
        mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'connect', codeVerifier: 'verifier' }));
        return call(githubCallback, {
          query: { state, code: 'error-code', error: 'access_denied', error_description: 'User denied access' },
          headers: defaultHeaders,
        });
      };

      // Tests read the refusal as JSON, like every other error.
      await expectRefusal(await denied(), 400, 'oauth_failed');

      const testMode = appConfig.mode;
      onTestFinished(() => {
        Reflect.set(appConfig, 'mode', testMode);
      });
      Reflect.set(appConfig, 'mode', 'development');
      const { response: res } = await denied();
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(`${appConfig.frontendUrl}/account?error=oauth_failed&severity=error`);
    });

    it('refuses when another user holds the provider address', async () => {
      const user = await createTestUser('local-account@example.com');
      await createTestUser(providerEmail);
      await pinConnect(user);

      const { response: res, error } = await connectCallback();

      await expectRefusal({ response: res, error }, 409, 'oauth_conflict');
      expect(await db.select().from(identitiesTable)).toHaveLength(0);
    });

    it('refuses a provider account already linked to another user', async () => {
      const user = await createTestUser('local-account@example.com');
      const other = await createTestUser('other-account@example.com');
      await linkIdentity(other, { email: providerEmail });
      await pinConnect(user);

      const { response: res, error } = await connectCallback();

      await expectRefusal({ response: res, error }, 409, 'oauth_conflict');
    });

    it('must not connect a provider to another account via a state naming that account', async () => {
      const victim = await createTestUser('victim-account@example.com');
      const attacker = await createTestUser('attacker-account@example.com');

      // A signed state that names the victim and no pin: nothing is connected.
      const unpinned = await connectCallback({ connectUserId: victim.id });
      await expectRefusal(unpinned, 401, 'oauth-connect_not_found');
      expect(await identitiesOf(victim.id)).toHaveLength(0);

      // The attacker's own pin with a state naming the victim: the pin decides, so it lands on the attacker.
      await pinConnect(attacker);
      expect((await connectCallback({ connectUserId: victim.id })).response.status).toBe(302);
      expect(await identitiesOf(victim.id)).toHaveLength(0);
      expect(await identitiesOf(attacker.id)).toHaveLength(1);
    });

    it('must not connect a provider via a pin whose session has ended', async () => {
      const user = await createTestUser('local-account@example.com');
      const sessionId = await pinConnect(user);

      // Signed out, or revoked from another device, while the provider's page stayed open in this browser.
      await db.update(sessionsTable).set({ revokedAt: new Date().toISOString() }).where(eq(sessionsTable.id, sessionId));
      const ended = await connectCallback();
      await expectRefusal(ended, 401, 'oauth-connect_not_found');
      expect(await identitiesOf(user.id)).toHaveLength(0);
      expect(await db.select().from(tokensTable).where(eq(tokensTable.type, 'oauth-connect'))).toHaveLength(0);

      // A new pin of a live session connects (positive control).
      await pinConnect(user);
      expect((await connectCallback()).response.status).toBe(302);
      expect(await identitiesOf(user.id)).toHaveLength(1);
    });

    it('connects once per pin, then refuses the same callback', async () => {
      const user = await createTestUser('local-account@example.com');
      await pinConnect(user);

      expect((await connectCallback()).response.status).toBe(302);
      const replay = await connectCallback();

      await expectRefusal(replay, 401, 'oauth-connect_not_found');
      expect(await db.select().from(tokensTable).where(eq(tokensTable.type, 'oauth-connect'))).toHaveLength(0);
    });

    it('starts a connect only with a pin of the signed-in account, and keeps any user id out of the state', async () => {
      const user = await createTestUser('local-account@example.com');
      const other = await createTestUser('other-account@example.com');
      const signedInAs = (id: string, sessionId = 'session') =>
        vi.mocked(resolveSession).mockResolvedValueOnce({ user: { id }, session: { id: sessionId } } as never);

      signedInAs(user.id);
      const unpinned = await call(github, { query: { type: 'connect' }, headers: defaultHeaders });
      expect(unpinned.response.status).toBe(401);

      const othersSession = await pinConnect(other);
      signedInAs(user.id, othersSession);
      const othersPin = await call(github, { query: { type: 'connect' }, headers: defaultHeaders });
      expect(othersPin.response.status).toBe(401);

      // The user's own pin, but from another of their sessions: refused too.
      const ownSession = await pinConnect(user);
      signedInAs(user.id);
      const otherSessionsPin = await call(github, { query: { type: 'connect' }, headers: defaultHeaders });
      expect(otherSessionsPin.response.status).toBe(401);

      signedInAs(user.id, ownSession);
      const started = await call(github, { query: { type: 'connect' }, headers: defaultHeaders });
      expect(started.response.status).toBe(302);
      expect(JSON.parse(mockCookieStore.get('oauth-state') ?? '{}')).toEqual({
        state: expect.any(String),
        provider: 'github',
        type: 'connect',
        codeVerifier: expect.any(String),
      });
    });
  });

  describe('Verify flow: the click on the verification mail proves the inbox', () => {
    const state = 'mock-state-verify';
    const providerEmail = 'github-user@example.com';

    /** A connected-but-unverified GitHub account on another address, with the mailed single-use token in hand. */
    const connectedUnverified = async () => {
      const user = await createTestUser('local-account@example.com');
      const oauthAccount = await linkIdentity(user, { verified: false, email: providerEmail });

      const rawSingleUse = nanoid(40);
      const { row: token } = await insertTestToken(
        'oauth-verification',
        { id: user.id, email: providerEmail },
        { identityId: oauthAccount.id, openedWith: rawSingleUse, expiresInMs: 5 * 60 * 1000 },
      );
      mockCookieStore.set('oauth-verification', rawSingleUse);
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'verify', codeVerifier: 'verifier', tokenId: token.id }));

      return { user, oauthAccount };
    };

    it('adds the provider address to the account as a proven inbox', async () => {
      const { user, oauthAccount } = await connectedUnverified();

      const { response: res } = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

      expect(res.status).toBe(302);
      const [verifiedAccount] = await db.select().from(identitiesTable).where(eq(identitiesTable.id, oauthAccount.id));
      expect(verifiedAccount.verified).toBe(true);

      const [row] = await db.select().from(emailsTable).where(eq(emailsTable.email, providerEmail));
      expect(row).toMatchObject({ userId: user.id, verifiedAt: expect.any(String), lastVerifiedVia: 'github' });
      // The primary is untouched.
      const [primary] = await db.select().from(emailsTable).where(eq(emailsTable.email, 'local-account@example.com'));
      expect(primary.userId).toBe(user.id);
    });

    it('must not sign in twice via one verification link', async () => {
      await connectedUnverified();
      // The cookies of the opened link and its round trip, which a replay presents again.
      const heldCookies = [...mockCookieStore];

      const first = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });
      expect(cookieChange(first.response, 'session')).toBe('set');

      for (const [name, value] of heldCookies) mockCookieStore.set(name, value);
      const replay = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

      await expectRefusal(replay, 401, 'oauth-verification_not_found');
      expect(cookieChange(replay.response, 'session')).toBeUndefined();
      expect(await db.select().from(tokensTable).where(eq(tokensTable.type, 'oauth-verification'))).toHaveLength(0);
    });

    it('refuses when another account took the address after the connect started', async () => {
      const { user } = await connectedUnverified();
      await createTestUser(providerEmail);

      const { response: res, error } = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

      await expectRefusal({ response: res, error }, 409, 'oauth_conflict');
      const [row] = await db.select().from(emailsTable).where(eq(emailsTable.email, providerEmail));
      expect(row.userId).not.toBe(user.id);
    });
  });

  describe('PKCE binding', () => {
    // GHSA-wxw3-q3m9-c3jr / GHSA-9h47-pqcx-hjr4: a callback whose stored state has no code verifier is refused, so
    // no round trip runs without the binding that stops an injected code (RFC 9700 §4.5), GitHub's included.
    it.each([
      { name: 'github', fn: githubCallback },
      { name: 'google', fn: googleCallback },
      { name: 'microsoft', fn: microsoftCallback },
    ])('should reject $name callback when codeVerifier is missing from the state cookie', async ({ name, fn }) => {
      const state = 'mock-state-test';
      // Cookie present, but WITHOUT a PKCE code verifier.
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: name, type: 'auth' }));

      const { response: res, error } = await call(fn, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

      await expectRefusal({ response: res, error }, 401, 'invalid_state');
    });
  });

  describe('Callbacks per provider', () => {
    const providers = [
      { provider: 'github', fn: githubCallback, client: githubAuth, oidc: false },
      { provider: 'google', fn: googleCallback, client: googleAuth, oidc: true },
      { provider: 'microsoft', fn: microsoftCallback, client: microsoftAuth, oidc: true },
    ] as const;

    /** A state cookie as the provider's own start writes it: a code verifier, and a nonce for an OIDC provider. */
    const pendingState = (provider: string, oidc: boolean) => {
      const state = `mock-state-${nanoid(6)}`;
      const payload = { state, provider, type: 'auth', codeVerifier: 'verifier', ...(oidc && { nonce: 'nonce' }) };
      mockCookieStore.set('oauth-state', JSON.stringify(payload));
      return state;
    };

    const callback = (fn: (typeof providers)[number]['fn'], state: string) =>
      call(fn, { query: { state, code: 'mock-auth-code', iss: 'https://issuer.example' }, headers: defaultHeaders });

    it.each(providers)('refuses a $provider callback without a state cookie', async ({ fn, client }) => {
      await expectRefusal(await callback(fn, 'no-such-state'), 401, 'invalid_state');
      expect(client.validateAuthorizationCode).not.toHaveBeenCalled();
    });

    it.each(
      providers.flatMap((entry) => [
        { ...entry, thrown: 'a refused code', error: () => new OAuthCodeExchangeError(new Error('bad code')), type: 'invalid_credentials' },
        { ...entry, thrown: 'any other failure', error: () => new Error('network down'), type: 'oauth_failed' },
      ]),
    )('answers $thrown at the $provider code exchange with 401 $type', async ({ provider, fn, client, oidc, error, type }) => {
      vi.mocked(client.validateAuthorizationCode).mockRejectedValueOnce(error());
      await expectRefusal(await callback(fn, pendingState(provider, oidc)), 401, type);
    });

    it.each(providers)('refuses a $provider callback while the provider is off', async ({ provider, fn, oidc }) => {
      const enabled = ['github', 'google', 'microsoft'] as const;
      setTestConfig({ enabledOAuthProviders: enabled.filter((name) => name !== provider) });
      onTestFinished(() => setTestConfig({ enabledOAuthProviders: [...enabled] }));

      const refused = await callback(fn, pendingState(provider, oidc));
      await expectRefusal(refused, 400, 'unsupported_oauth');
      expect((refused.error as ErrorResponse).strategy).toBe(provider);
    });

    it.each([
      { ...providers[0], urls: ['https://api.github.com/user', 'https://api.github.com/user/emails'] },
      // An OIDC provider's profile is the claims its client verified, userinfo included: the round trip reads nothing more.
      { ...providers[1], urls: [] },
      { ...providers[2], urls: [] },
    ])('reads the $provider profile with the exchanged token, its requests all at once', async ({ provider, fn, client, oidc, urls }) => {
      // Each request records how many were in flight when it started: parallel requests overlap.
      const started: { url: string; authorization: string | null; inFlight: number }[] = [];
      let inFlight = 0;
      const stub = vi.mocked(fetch);
      const original = stub.getMockImplementation();
      onTestFinished(() => {
        if (original) stub.mockImplementation(original);
      });
      stub.mockImplementation(async (input, init) => {
        inFlight++;
        started.push({ url: String(input), authorization: new Headers(init?.headers).get('authorization'), inFlight });
        await new Promise((resolve) => setTimeout(resolve, 0));
        inFlight--;
        return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as unknown as Response;
      });

      const state = pendingState(provider, oidc);
      const { response } = await callback(fn, state);

      expect(response.status).toBe(302);
      expect(started).toEqual(urls.map((url, index) => ({ url, authorization: 'Bearer mock-access-token', inFlight: index + 1 })));
      // The response's issuer reaches the client, which compares it with the provider's (RFC 9207).
      const [[authorizationResponse, options]] = vi.mocked(client.validateAuthorizationCode).mock.calls;
      expect(authorizationResponse).toEqual({ code: 'mock-auth-code', state, iss: 'https://issuer.example' });
      expect(options).toEqual({ codeVerifier: 'verifier', nonce: oidc ? 'nonce' : undefined });
    });

    // A state belongs to the provider whose start minted it, whatever else its cookie holds.
    it.each([
      { from: 'google', start: google, minter: googleAuth, to: 'github', fn: githubCallback, client: githubAuth },
      { from: 'microsoft', start: microsoft, minter: microsoftAuth, to: 'google', fn: googleCallback, client: googleAuth },
      { from: 'github', start: github, minter: githubAuth, to: 'microsoft', fn: microsoftCallback, client: microsoftAuth },
    ])('must not accept a $from-minted state at the $to callback', async ({ start, minter, fn, client }) => {
      const { response: started } = await call(start, { query: { type: 'auth' }, headers: defaultHeaders });
      expect(started.status).toBe(302);
      const [[state]] = vi.mocked(minter.createAuthorizationURL).mock.calls;

      await expectRefusal(await callback(fn, state), 401, 'invalid_state');
      expect(client.validateAuthorizationCode).not.toHaveBeenCalled();
    });
  });

  describe('Verified redirect honors only validated same-origin paths', () => {
    const linkVerifiedAccount = async () => {
      const userEmail = 'github-user@example.com';
      const user = await createTestUser(userEmail);
      await linkIdentity(user);
      return user;
    };

    it('should honor a valid redirectAfter on a verified OAuth sign-in', async () => {
      await linkVerifiedAccount();

      const state = 'mock-state-test';
      mockCookieStore.set(
        'oauth-state',
        JSON.stringify({ state, provider: 'github', type: 'auth', redirectAfter: '/orgs/acme?tab=files', codeVerifier: 'verifier' }),
      );

      const { response: res } = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(`${appConfig.frontendUrl}/orgs/acme?tab=files`);
    });

    // An attacker-controlled redirectAfter must never become the Location. The start of the flow stores it unchecked,
    // so the check at sign-in is the only one: dot segments collapse to a scheme-relative path once resolved.
    it('should redirect a verified OAuth sign-in to a frontend path, not an attacker redirectAfter', async () => {
      await linkVerifiedAccount();

      for (const redirectAfter of ['//evil.example', '/..//evil.example']) {
        const state = 'mock-state-test';
        mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'auth', redirectAfter, codeVerifier: 'verifier' }));

        const { response: res } = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

        expect(res.status, redirectAfter).toBe(302);
        const location = res.headers.get('location');
        expect(location, redirectAfter).toBeTruthy();
        expect(location, redirectAfter).not.toContain('evil.example');
        expect(location!.startsWith(appConfig.frontendUrl), redirectAfter).toBe(true);
      }
    });
  });

  describe('Integration & Edge Cases', () => {
    it('should handle OAuth flow with MFA enabled user', async () => {
      const userEmail = 'github-user@example.com';
      const user = await createTestUser(userEmail);
      await db.update(usersTable).set({ mfaRequired: true }).where(eq(usersTable.id, user.id));

      await linkIdentity(user);

      const state = 'mock-state-test';
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'auth', codeVerifier: 'verifier' }));

      const { response: res } = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).toContain('/auth/mfa');

      // GHSA-xg6x-h9c9-2m83: no session may be issued before the second factor completes.
      expect(cookieChange(res, 'session')).toBeUndefined();
    });
  });
  describe("Invite flow: the opened invitation and the provider's verification prove the inbox together", () => {
    const state = 'mock-state-invite';
    const providerEmail = 'github-user@example.com';

    /** An invitation to `email` whose link this browser opened, and an invite round trip started here. */
    const openedInvitation = async (email: string, provider: 'github' | 'google' = 'github') => {
      const organization = await createTestOrganization();
      const inviter = await createTestUser('inviter@example.com');
      const invitation = await createInvitation({ organization, email, createdBy: inviter.id, token: 'invoked' });
      // The cookie mock keeps plain values: this browser's single-use cookie for the opened link.
      mockCookieStore.set('invitation', invitation.rawSingleUseToken);
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider, type: 'invite', codeVerifier: 'verifier' }));
      return { ...invitation, organization };
    };

    const inviteCallback = (fn: typeof githubCallback | typeof googleCallback = githubCallback) =>
      call(fn, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });

    /** The verified claims of a Google sign-in, read by the real transform, so its rule of which addresses Google hosts runs. */
    const googleAsserts = async (claims: Record<string, unknown>) => {
      type TransformModule = typeof import('#/modules/auth/oauth/helpers/transform-user-data');
      const { transformSocialUserData } = await import('#/modules/auth/oauth/helpers/transform-user-data');
      const actual = await vi.importActual<TransformModule>('#/modules/auth/oauth/helpers/transform-user-data');
      vi.mocked(transformSocialUserData).mockImplementationOnce(actual.transformSocialUserData);
      const profile = { sub: 'google-user-id', name: 'Test User', given_name: 'Test', family_name: 'User', email_verified: true };
      vi.mocked(googleAuth.validateAuthorizationCode).mockResolvedValueOnce({ accessToken: 'mock-access-token', claims: { ...profile, ...claims } });
    };

    it('creates the account verified, accepts the invitation and signs in, with no second verification mail', async () => {
      // A Google Workspace account: Google hosts the address, so the sign-in proves the inbox.
      const { inactiveMembership, organization } = await openedInvitation(providerEmail, 'google');
      await googleAsserts({ email: providerEmail, hd: 'example.com' });

      const { response: res } = await inviteCallback(googleCallback);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).not.toContain('/auth/email-verification');
      expect(cookieChange(res, 'session')).toBe('set');
      expect(mailer.sendEmails).not.toHaveBeenCalled();

      const [account] = await db.select().from(usersTable).where(eq(usersTable.email, providerEmail));
      // The account starts with the provider's names. Its avatar is not taken over: avatars come from the app's CDN only.
      expect(account).toMatchObject({ name: 'Test User', givenName: 'Test', familyName: 'User', thumbnailUrl: null });
      const [address] = await db.select().from(emailsTable).where(eq(emailsTable.email, providerEmail));
      expect(address).toMatchObject({ userId: account.id, verifiedAt: expect.any(String), lastVerifiedVia: 'google' });
      const [identity] = await db.select().from(identitiesTable).where(eq(identitiesTable.userId, account.id));
      expect(identity).toMatchObject({ issuer: 'google', subject: 'google-user-id', verified: true });

      // The invitation of the opened link is accepted with the sign-up, as at a magic-link sign-in.
      expect(await db.select().from(inactiveMembershipsTable).where(eq(inactiveMembershipsTable.id, inactiveMembership.id))).toEqual([]);
      const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, account.id));
      expect(memberships.map(({ organizationId }) => organizationId)).toEqual([organization.id]);
    });

    it('must not create an account via an invite round trip whose provider has not verified the address', async () => {
      // An invitation link can be forwarded, so only a provider's own verification stands for the inbox with it.
      await openedInvitation(providerEmail);
      const { transformGithubUserData } = await import('#/modules/auth/oauth/helpers/transform-user-data');
      vi.mocked(transformGithubUserData).mockReturnValueOnce({
        id: 'github-user-id',
        slug: 'testuser',
        email: providerEmail,
        name: 'Test User',
        emailVerified: false,
        givenName: 'Test',
        familyName: 'User',
      });

      const { response: res } = await inviteCallback();
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/auth/email-verification/signup');
      expect(cookieChange(res, 'session')).toBeUndefined();
      expect(await db.select().from(usersTable).where(eq(usersTable.email, providerEmail))).toHaveLength(0);
      expect(await db.select().from(identitiesTable)).toHaveLength(0);

      // The sign-up waits on the mail to the invited address; completing it claims the invitation with the account.
      expect(mailsTo(providerEmail)).toHaveLength(1);
      const pending = await db.select().from(tokensTable).where(eq(tokensTable.type, 'oauth-verification'));
      expect(pending).toEqual([
        expect.objectContaining({
          email: providerEmail,
          userId: null,
          pendingSignUp: expect.objectContaining({ issuer: 'github', subject: 'github-user-id' }),
        }),
      ]);
    });

    // A verified flag can date from before the address changed hands: a former holder who opens a forwarded invitation
    // link first must not get the account on the invitee's address (pre-account takeover).
    it.each([
      { name: 'a GitHub address, verified once', provider: 'github' as const, fn: githubCallback, signIn: async () => {} },
      {
        name: 'a Google address outside Gmail and Workspace',
        provider: 'google' as const,
        fn: googleCallback,
        signIn: () => googleAsserts({ email: providerEmail }),
      },
    ])('must not create an account on the invited address via $name', async ({ provider, fn, signIn }) => {
      await openedInvitation(providerEmail, provider);
      await signIn();

      const { response: res } = await inviteCallback(fn);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/auth/email-verification/signup');
      expect(cookieChange(res, 'session')).toBeUndefined();
      expect(await db.select().from(usersTable).where(eq(usersTable.email, providerEmail))).toHaveLength(0);
      expect(await db.select().from(identitiesTable)).toHaveLength(0);
      // The sign-up waits on the mail to the invited address, as any provider sign-up does.
      expect(mailsTo(providerEmail)).toHaveLength(1);
    });

    it('must not create an account via an invite round trip in a browser that did not open the invitation', async () => {
      await openedInvitation(providerEmail);
      mockCookieStore.delete('invitation');

      const { response: res, error } = await inviteCallback();
      await expectRefusal({ response: res, error }, 401, 'invitation_not_found');
      expect(await db.select().from(usersTable).where(eq(usersTable.email, providerEmail))).toHaveLength(0);
      expect(await db.select().from(identitiesTable)).toHaveLength(0);
    });

    it('must not create an account on the invited address via a provider account of another address', async () => {
      const { token } = await openedInvitation('invited@example.com');

      const { response: res, error } = await inviteCallback();
      await expectRefusal({ response: res, error }, 409, 'oauth_wrong_email');
      // The refusal names the invitation, so the error page can resume it with another method.
      expect(membersOf(error)).toEqual({ tokenId: token.id });
      expect(await db.select().from(usersTable).where(eq(usersTable.email, providerEmail))).toHaveLength(0);
      expect(await db.select().from(identitiesTable)).toHaveLength(0);
    });
  });

  describe('Sign-up: no account before the inbox is proven', () => {
    const providerEmail = 'github-user@example.com';
    const verifyState = 'mock-state-verify-sign-up';

    const signUpCallback = () => {
      const state = 'mock-state-sign-up';
      mockCookieStore.set('oauth-state', JSON.stringify({ state, provider: 'github', type: 'auth', codeVerifier: 'verifier' }));
      return call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });
    };

    /** Opens the verification link in a signed-out browser and confirms it on its page; the browser keeps its single-use cookie. */
    const openVerificationLink = (rawToken: string) => openHeldLink('oauth-verification', rawToken);

    /** The provider's callback for the verify round trip, in the browser that opened the link. */
    const verifyCallback = () => {
      mockCookieStore.set('oauth-state', JSON.stringify({ state: verifyState, provider: 'github', type: 'verify', codeVerifier: 'verifier' }));
      return call(githubCallback, { query: { state: verifyState, code: 'mock-auth-code' }, headers: defaultHeaders });
    };

    const accountsFor = (email: string) => db.select().from(usersTable).where(eq(usersTable.email, email));
    const verificationTokens = () => db.select().from(tokensTable).where(eq(tokensTable.type, 'oauth-verification'));

    it('must not create an account via an OAuth sign-up whose address is unproven', async () => {
      const { response: res } = await signUpCallback();

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toContain('/auth/email-verification/signup');
      expect(cookieChange(res, 'session')).toBeUndefined();
      expect(await accountsFor(providerEmail)).toHaveLength(0);
      expect(await db.select().from(emailsTable).where(eq(emailsTable.email, providerEmail))).toHaveLength(0);
      expect(await db.select().from(identitiesTable)).toHaveLength(0);

      // The sign-up waits on the verification token alone.
      expect(await verificationTokens()).toEqual([
        expect.objectContaining({
          email: providerEmail,
          userId: null,
          identityId: null,
          pendingSignUp: expect.objectContaining({ issuer: 'github', subject: 'github-user-id', givenName: 'Test', familyName: 'User' }),
        }),
      ]);
      // The mail asks to finish signing up, not to connect a provider to an account the visitor does not have.
      expect(mailsTo(providerEmail).at(-1)?.statics).toMatchObject({ isNewUser: true, providerName: 'GitHub' });
    });

    it('creates the account once the mailed link and the same provider account prove it (positive control)', async () => {
      await signUpCallback();
      const { url, token } = mailedLink('verificationLink');
      expect(url).toBe(`${appConfig.backendAuthUrl}/invoke-token/oauth-verification/${token}`);
      const opened = await openVerificationLink(token);
      expect(opened.response.status).toBe(200);
      const verifyStart = new URL(opened.redirectTo ?? '');
      expect(`${verifyStart.origin}${verifyStart.pathname}`).toBe(`${appConfig.backendAuthUrl}/github`);
      expect(verifyStart.searchParams.get('type')).toBe('verify');
      expect(await accountsFor(providerEmail)).toHaveLength(0);

      // The verify round trip starts where the link redirected, which pins its state in this browser.
      const started = await call(github, { query: { type: 'verify' }, headers: defaultHeaders });
      expect(started.response.status).toBe(302);
      const { state } = JSON.parse(mockCookieStore.get('oauth-state') ?? '{}');

      const { response: res } = await call(githubCallback, { query: { state, code: 'mock-auth-code' }, headers: defaultHeaders });
      expect(res.status).toBe(302);
      expect(cookieChange(res, 'session')).toBe('set');

      const [account] = await accountsFor(providerEmail);
      // The names the provider asserted at the start waited on the verification with the sign-up.
      expect(account).toMatchObject({ name: 'Test User', givenName: 'Test', familyName: 'User', thumbnailUrl: null });
      const [address] = await db.select().from(emailsTable).where(eq(emailsTable.email, providerEmail));
      expect(address).toMatchObject({ userId: account.id, verifiedAt: expect.any(String), lastVerifiedVia: 'github' });
      const [identity] = await db.select().from(identitiesTable).where(eq(identitiesTable.userId, account.id));
      expect(identity).toMatchObject({ issuer: 'github', subject: 'github-user-id', verified: true });
      // The verification is spent with the sign-up, and this browser's cookie for it goes once that has committed.
      expect(await verificationTokens()).toHaveLength(0);
      expect(mockCookieStore.has('oauth-verification')).toBe(false);
    });

    it('must not complete an OAuth sign-up via another provider account', async () => {
      await signUpCallback();
      await openVerificationLink(mailedLink('verificationLink').token);

      const { transformGithubUserData } = await import('#/modules/auth/oauth/helpers/transform-user-data');
      vi.mocked(transformGithubUserData).mockReturnValueOnce({
        id: 'another-github-user-id',
        slug: 'someone',
        email: providerEmail,
        name: 'Someone',
        emailVerified: true,
        givenName: 'Some',
        familyName: 'One',
      });

      const { response: res, error } = await verifyCallback();
      await expectRefusal({ response: res, error }, 400, 'oauth_failed');
      expect(await accountsFor(providerEmail)).toHaveLength(0);
      expect(await db.select().from(identitiesTable)).toHaveLength(0);
    });

    it('must not complete an OAuth sign-up in a browser that did not open the mailed link', async () => {
      await signUpCallback();

      const { response: res, error } = await verifyCallback();
      await expectRefusal({ response: res, error }, 401, 'oauth-verification_not_found');
      expect(await accountsFor(providerEmail)).toHaveLength(0);
      expect(await verificationTokens()).toHaveLength(1);
    });

    it('refuses to complete a sign-up when an account took the address meanwhile', async () => {
      await signUpCallback();
      await openVerificationLink(mailedLink('verificationLink').token);
      const holder = await createTestUser(providerEmail);

      const { response: res, error } = await verifyCallback();
      await expectRefusal({ response: res, error }, 409, 'oauth_email_exists');
      expect((await accountsFor(providerEmail)).map((user) => user.id)).toEqual([holder.id]);
      expect(await db.select().from(identitiesTable)).toHaveLength(0);
    });

    const closeRegistration = () => {
      setTestConfig({ selfRegistration: false });
      onTestFinished(() => setTestConfig({ selfRegistration: true }));
    };

    it('must not create an account via a pending OAuth sign-up once registration has closed', async () => {
      await signUpCallback();
      await openVerificationLink(mailedLink('verificationLink').token);
      closeRegistration();

      const { response: res, error } = await verifyCallback();
      await expectRefusal({ response: res, error }, 403, 'sign_up_restricted');
      expect(cookieChange(res, 'session')).toBeUndefined();
      expect(await accountsFor(providerEmail)).toHaveLength(0);
      expect(await db.select().from(identitiesTable)).toHaveLength(0);

      // The verification stays unspent: its row, and this browser's single-use cookie.
      expect(await verificationTokens()).toHaveLength(1);
      expect(mockCookieStore.has('oauth-verification')).toBe(true);
    });

    it('completes the sign-up of an invited address after registration closed (positive control)', async () => {
      await signUpCallback();
      await openVerificationLink(mailedLink('verificationLink').token);
      closeRegistration();
      const organization = await createTestOrganization();
      const inviter = await createTestUser('inviter@example.com');
      await createInvitation({ organization, email: providerEmail, createdBy: inviter.id });

      const { response: res } = await verifyCallback();
      expect(res.status).toBe(302);
      expect(cookieChange(res, 'session')).toBe('set');
      expect(await accountsFor(providerEmail)).toHaveLength(1);
      expect(await verificationTokens()).toHaveLength(0);
    });

    it('starts the sign-up of an invited address while registration is closed', async () => {
      closeRegistration();
      const refused = await signUpCallback();
      await expectRefusal(refused, 403, 'sign_up_restricted');
      expect(await verificationTokens()).toHaveLength(0);

      // The same gate as the sign-up's completion: an invitation to the address lets it start.
      const organization = await createTestOrganization();
      const inviter = await createTestUser('inviter@example.com');
      await createInvitation({ organization, email: providerEmail, createdBy: inviter.id });
      const started = await signUpCallback();
      expect(started.response.status).toBe(302);
      expect(started.response.headers.get('location')).toContain('/auth/email-verification');
      expect(await verificationTokens()).toHaveLength(1);
      expect(await accountsFor(providerEmail)).toHaveLength(0);
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
