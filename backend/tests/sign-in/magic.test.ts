import { and, eq } from 'drizzle-orm';
import { invokeToken, sendMagicLink } from 'sdk';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { userCountersTable } from '#/modules/user/user-counters-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders, signUpUser } from '../fixtures';
import { createUser, enableMFAForUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

vi.mock('#/lib/mailer', () => ({
  mailer: { prepareEmails: vi.fn().mockResolvedValue(undefined) },
}));

setTestConfig({ enabledAuthStrategies: ['magic'], selfRegistration: true });

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearDatabase();
  vi.clearAllMocks();
});

/** Mark a user as returning; without a counters row `lastSignInAt` resolves to null (new user). */
async function markReturning(userId: string) {
  await db.insert(userCountersTable).values({ userId, lastSignInAt: new Date().toISOString() });
}

/** Insert a magic token directly and return the raw secret for the invoke URL. */
async function createMagicToken(user: { id: string; email: string }, redirectPath: string | null = null) {
  const rawToken = nanoid(40);
  await db.insert(tokensTable).values({
    secret: hashToken(rawToken),
    type: 'magic',
    userId: user.id,
    email: user.email,
    createdBy: user.id,
    redirectPath,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  return rawToken;
}

/** Fetch the single magic token row for a user. */
async function getMagicToken(userId: string) {
  const [token] = await db
    .select()
    .from(tokensTable)
    .where(and(eq(tokensTable.userId, userId), eq(tokensTable.type, 'magic')));
  return token;
}

describe('Magic link authentication', async () => {
  const call = await createAppClient();

  describe('Send magic link', () => {
    it('should store a validated redirect path on the token', async () => {
      const user = await createUser(signUpUser.email);

      const { response: res } = await call(sendMagicLink, {
        body: { email: signUpUser.email, redirect: '/orgs/acme?tab=files#top' },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(204);
      expect((await getMagicToken(user.id)).redirectPath).toBe('/orgs/acme?tab=files#top');
    });

    it.each([
      { name: 'absolute URL', redirect: 'https://evil.example/phish' },
      { name: 'scheme-relative URL', redirect: '//evil.example' },
      { name: 'backslash authority trick', redirect: '/\\evil.example' },
      { name: 'backend route', redirect: '/api/me' },
      { name: 'overlong path', redirect: `/${'a'.repeat(300)}` },
    ])('should drop an invalid redirect ($name)', async ({ redirect }) => {
      const user = await createUser(signUpUser.email);

      const { response: res } = await call(sendMagicLink, {
        body: { email: signUpUser.email, redirect },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(204);
      expect((await getMagicToken(user.id)).redirectPath).toBeNull();
    });
  });

  describe('Invoke magic link', () => {
    it('should redirect a returning user to the stored path', async () => {
      const user = await createUser(signUpUser.email);
      await markReturning(user.id);
      const rawToken = await createMagicToken(user, '/orgs/acme?tab=files');

      const { response: res } = await call(invokeToken, {
        path: { type: 'magic', token: rawToken },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(`${appConfig.frontendUrl}/orgs/acme?tab=files`);
    });

    it('should let an explicit redirect win over the welcome page for a new user', async () => {
      const user = await createUser(signUpUser.email);
      const rawToken = await createMagicToken(user, '/orgs/acme');

      const { response: res } = await call(invokeToken, {
        path: { type: 'magic', token: rawToken },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(`${appConfig.frontendUrl}/orgs/acme`);
    });

    it('should append skipWelcome when the explicit redirect targets home', async () => {
      const user = await createUser(signUpUser.email);
      const rawToken = await createMagicToken(user, `${appConfig.defaultRedirectPath}?foo=bar`);

      const { response: res } = await call(invokeToken, {
        path: { type: 'magic', token: rawToken },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      const location = new URL(res.headers.get('location') ?? '');
      expect(location.pathname).toBe(appConfig.defaultRedirectPath);
      expect(location.searchParams.get('foo')).toBe('bar');
      expect(location.searchParams.get('skipWelcome')).toBe('true');
    });

    it('should fall back to welcome for a new user without a redirect', async () => {
      const user = await createUser(signUpUser.email);
      const rawToken = await createMagicToken(user);

      const { response: res } = await call(invokeToken, {
        path: { type: 'magic', token: rawToken },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(`${appConfig.frontendUrl}${appConfig.welcomeRedirectPath}`);
    });

    it('should never redirect to a stored path that fails re-validation', async () => {
      // Defense in depth: a row written before validation rules tightened must not replay.
      const user = await createUser(signUpUser.email);
      const rawToken = await createMagicToken(user, 'https://evil.example/phish');

      const { response: res } = await call(invokeToken, {
        path: { type: 'magic', token: rawToken },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      const location = res.headers.get('location');
      expect(location).not.toContain('evil.example');
      expect(location?.startsWith(appConfig.frontendUrl)).toBe(true);
    });

    it('should hand the redirect to the MFA page for an MFA user', async () => {
      const user = await createUser(signUpUser.email);
      await enableMFAForUser(user.id);
      const rawToken = await createMagicToken(user, '/orgs/acme');

      const { response: res } = await call(invokeToken, {
        path: { type: 'magic', token: rawToken },
        headers: defaultHeaders,
      });

      expect(res.status).toBe(302);
      const location = new URL(res.headers.get('location') ?? '');
      expect(location.pathname).toBe('/auth/mfa');
      expect(location.searchParams.get('redirect')).toBe('/orgs/acme');
      // Session must not be set before the MFA challenge completes
      expect(res.headers.get('set-cookie') ?? '').not.toContain(
        `${appConfig.slug}-session-${appConfig.cookieVersion}=`,
      );
    });
  });

  describe('Invoke token type restriction', () => {
    it('should reject invoking a confirm-mfa token', async () => {
      // confirm-mfa lives only in a cookie; the invoke route's param schema excludes it. Raw
      // request because the generated SDK already rejects the type client-side.
      const { baseApp } = await import('#/routes');
      const res = await baseApp.request(`/auth/invoke-token/confirm-mfa/${nanoid(40)}`, { headers: defaultHeaders });

      expect(res.status).toBe(400);
    });
  });
});
