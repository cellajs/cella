import { sql } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { appConfig } from 'shared';
import { vi } from 'vitest';
import { getAdminDb } from '#/db/db';
import { resetOrganizationMockEnforcers } from '#/modules/organization/organization-mocks';
import { resetUserMockEnforcers } from '#/modules/user/user-mocks';
import { overrideConfig } from './fixtures';

type AuthStrategy = 'passkey' | 'oauth' | 'totp' | 'magic';
type OAuthProvider = 'github' | 'google' | 'microsoft';

type ConfigOverride = {
  enabledAuthStrategies?: AuthStrategy[];
  enabledOAuthProviders?: OAuthProvider[];
  selfRegistration?: boolean;
};

/** TRUNCATE CASCADE on the admin connection (runtime_role holds no TRUNCATE), plus a mock-enforcer reset so unique values do not conflict across tests. */
export async function clearDatabase() {
  resetUserMockEnforcers();
  resetOrganizationMockEnforcers();

  await getAdminDb('test cleanup').execute(sql`TRUNCATE TABLE 
    sessions, tokens, passkeys, identities, emails, users, api_keys, service_accounts, actors, oidc_payloads, oauth_clients
    CASCADE`);
}

/** Vitest hoists vi.mock(), so call at top level: vi.mock('#/middlewares/rate-limiter/core', rateLimiterCoreMock) */
export const rateLimiterCoreMock = () => ({
  rateLimiter: vi.fn().mockImplementation((mode: string, key: string) => {
    const handler = async (_: Context, next: Next) => {
      await next();
    };
    return Object.assign(handler, { keyPrefix: `${key}_${mode}`, buckets: [] });
  }),
});

/** Use at top level: vi.mock('#/middlewares/rate-limiter/helpers', rateLimiterHelpersMock) */
export const rateLimiterHelpersMock = async (importOriginal: () => Promise<Record<string, unknown>>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    checkIpRateLimitStatus: vi.fn().mockResolvedValue({ isLimited: false }),
    checkRateLimitStatus: vi.fn().mockResolvedValue({ isLimited: false }),
  };
};

/** Use at top level: vi.mock('oauth4webapi', oauth4webapiMock) */
export const oauth4webapiMock = async () => {
  const actual = await vi.importActual('oauth4webapi');
  return {
    ...actual,
    generateRandomState: () => `mock-state-${Math.random().toString(36).substring(7)}`,
    generateRandomCodeVerifier: () => `mock-code-verifier-${Math.random().toString(36).substring(7)}`,
    generateRandomNonce: () => `mock-nonce-${Math.random().toString(36).substring(7)}`,
  };
};

/** Sets the sign-in methods and self-registration for the rest of the test file. */
export function setTestConfig({ selfRegistration, ...overrides }: ConfigOverride) {
  overrideConfig(appConfig, overrides);
  if (selfRegistration !== undefined) overrideConfig(appConfig.has, { selfRegistration });
}

/**
 * In-memory cookie store standing in for the real cookie helpers.
 * Use at top level: vi.mock('#/modules/auth/general/helpers/cookie', async () => (await import('../test-utils')).cookieMock())
 * Call clearCookieStore() in afterEach; pre-populate by writing to mockCookieStore.
 */
export const mockCookieStore = new Map<string, string>();
export const clearCookieStore = () => mockCookieStore.clear();

/** An auth cookie's name as the app gives it in test mode, which is secure, so the __Host- prefix applies. */
const mockCookieName = (name: string) => `__Host-${appConfig.slug}-${name}-${appConfig.cookieVersion}`;

export const cookieMock = () => ({
  authCookieName: mockCookieName,
  // The store keeps plain values, so a sealed value is its content.
  sealAuthCookie: (_name: string, content: string) => content,
  cookieSecrets: ['test-cookie-secret-for-unit-tests'],
  setAuthCookie: vi.fn().mockImplementation(async (ctx, name, value, _maxAge) => {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    mockCookieStore.set(name, stringValue);
    ctx.res.headers.append('set-cookie', `${mockCookieName(name)}=${stringValue}; Path=/; HttpOnly; SameSite=Lax`);
  }),
  getAuthCookie: vi.fn().mockImplementation(async (_ctx, name) => {
    return mockCookieStore.get(name) || null;
  }),
  deleteAuthCookie: vi.fn().mockImplementation(async (ctx, name) => {
    mockCookieStore.delete(name);
    ctx.res.headers.append('set-cookie', `${mockCookieName(name)}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
  }),
});

/** Use at top level: vi.mock('#/modules/auth/general/helpers/session', sessionMock) */
export const sessionMock = () => ({
  setUserSession: vi.fn().mockImplementation(async (ctx, _user, _provider) => {
    const sessionToken = 'mock-session-token';
    ctx.res.headers.append(
      'set-cookie',
      `${mockCookieName('session')}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax`,
    );
    return sessionToken;
  }),
  resolveSession: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' }, session: { id: 'test-session-id' } }),
  // A request that may present no session presents none, so an emailed link opens as in a signed-out browser.
  findSession: vi.fn().mockResolvedValue(null),
});
