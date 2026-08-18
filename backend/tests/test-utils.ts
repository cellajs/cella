import { sql } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { appConfig } from 'shared';
import { vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { resetOrganizationMockEnforcers } from '#/modules/organization/organization-mocks';
import { resetUserMockEnforcers } from '#/modules/user/user-mocks';

type AuthStrategy = 'passkey' | 'oauth' | 'totp' | 'magic';
type OAuthProvider = 'github' | 'google' | 'microsoft';

type ConfigOverride = {
  enabledAuthStrategies?: AuthStrategy[];
  enabledOAuthProviders?: OAuthProvider[];
  selfRegistration?: boolean;
};

export function mockFetchRequest() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input) => {
      if (input instanceof Request) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => {
            try {
              return await input.clone().json();
            } catch {
              return {};
            }
          },
          text: async () => '',
          clone: () => input.clone(),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '',
        clone: () => ({
          json: async () => ({}),
          text: async () => '',
        }),
      });
    }),
  );
}

/** TRUNCATE CASCADE, plus a mock-enforcer reset so unique values do not conflict across tests. */
export async function clearDatabase() {
  resetUserMockEnforcers();
  resetOrganizationMockEnforcers();

  await db.execute(sql`TRUNCATE TABLE 
    sessions, tokens, passkeys, oauth_accounts, emails, users 
    CASCADE`);
}

/** Vitest hoists vi.mock(), so call at top level: vi.mock('#/middlewares/rate-limiter/core', rateLimiterCoreMock) */
export const rateLimiterCoreMock = () => ({
  rateLimiter: vi
    .fn()
    .mockImplementation(
      (mode: string, key: string, _identifiers: string[], opts?: { limits?: { points?: number } }) => {
        const points = opts?.limits?.points ?? 10;
        const handler = async (_: Context, next: Next) => {
          await next();
        };
        return Object.assign(handler, { keyPrefix: `${key}_${mode}`, points });
      },
    ),
  defaultOptions: {
    tableName: 'rate_limits',
    points: 10,
    duration: 60 * 60,
    blockDuration: 60 * 30,
  },
  slowOptions: {
    tableName: 'rate_limits',
    points: 100,
    duration: 60 * 60 * 24,
    blockDuration: 60 * 60 * 3,
  },
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

export function setTestConfig(overrides: ConfigOverride) {
  if (overrides.enabledAuthStrategies) {
    (appConfig as unknown as { enabledAuthStrategies: string[] }).enabledAuthStrategies =
      overrides.enabledAuthStrategies;
  }

  if (overrides.enabledOAuthProviders) {
    // `satisfies` in default-config narrows the type, so widen with a cast.
    (appConfig as unknown as { enabledOAuthProviders: string[] }).enabledOAuthProviders =
      overrides.enabledOAuthProviders;
  }

  if (overrides.selfRegistration !== undefined) {
    (appConfig.has as { selfRegistration: boolean }).selfRegistration = overrides.selfRegistration;
  }
}

/**
 * In-memory cookie store standing in for the real cookie helpers.
 * Use at top level: vi.mock('#/modules/auth/general/helpers/cookie', async () => (await import('../test-utils')).cookieMock())
 * Call clearCookieStore() in afterEach; pre-populate by writing to mockCookieStore.
 */
export const mockCookieStore = new Map<string, string>();
export const clearCookieStore = () => mockCookieStore.clear();

export const cookieMock = () => ({
  // Test mode is secure, so the __Host- prefix applies.
  authCookieName: (name: string) => `__Host-${appConfig.slug}-${name}-${appConfig.cookieVersion}`,
  setAuthCookie: vi.fn().mockImplementation(async (ctx, name, value, _maxAge) => {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    mockCookieStore.set(name, stringValue);
    const existingCookies = ctx.res.headers.get('set-cookie') || '';
    const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;
    const newCookie = `${versionedName}=${stringValue}; Path=/; HttpOnly; SameSite=Lax`;
    ctx.res.headers.set('set-cookie', existingCookies ? `${existingCookies}, ${newCookie}` : newCookie);
  }),
  getAuthCookie: vi.fn().mockImplementation(async (_ctx, name) => {
    return mockCookieStore.get(name) || null;
  }),
  deleteAuthCookie: vi.fn().mockImplementation(async (ctx, name) => {
    mockCookieStore.delete(name);
    const existingCookies = ctx.res.headers.get('set-cookie') || '';
    const versionedName = `${appConfig.slug}-${name}-${appConfig.cookieVersion}`;
    const deleteCookie = `${versionedName}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    ctx.res.headers.set('set-cookie', existingCookies ? `${existingCookies}, ${deleteCookie}` : deleteCookie);
  }),
});

/** Use at top level: vi.mock('#/modules/auth/general/helpers/session', sessionMock) */
export const sessionMock = () => ({
  setUserSession: vi.fn().mockImplementation(async (ctx, _user, _provider) => {
    const sessionToken = 'mock-session-token';
    const existingCookies = ctx.res.headers.get('set-cookie') || '';
    const sessionCookie = `${appConfig.slug}-session-${appConfig.cookieVersion}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax`;
    ctx.res.headers.set('set-cookie', existingCookies ? `${existingCookies}, ${sessionCookie}` : sessionCookie);
    return sessionToken;
  }),
  getParsedSessionCookie: vi.fn().mockResolvedValue({ sessionToken: 'mock-session-token' }),
  validateSession: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' }, session: { id: 'test-session-id' } }),
});
