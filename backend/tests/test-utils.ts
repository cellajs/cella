/**
 * Test setup utilities for configuring test environments.
 *
 * This file contains helper functions to:
 * - Mock global behaviors like `fetch`
 * - Clean up the database (e.g., clear users and emails tables)
 * - Dynamically enable/disable config flags (e.g., auth strategies)
 *
 * Database migrations are handled by global-setup.ts before tests run.
 * These functions are intended to be used in test files to keep setup DRY and consistent.
 *
 * IMPORTANT: vi.mock() calls must be at the top level of each test file (vitest hoists them).
 * Use the exported mock factory functions (rateLimiterCoreMock, rateLimiterHelpersMock, arcticMock,
 * cookieMock, sessionMock) in your top-level vi.mock() calls instead of wrapping them in helper functions.
 */

import { sql } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { appConfig } from 'shared';
import { vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { resetOrganizationMockEnforcers } from '#/modules/organization/organization-mocks';
import { resetUserMockEnforcers } from '#/modules/user/user-mocks';

/**
 * Types
 */
type AuthStrategy = 'passkey' | 'oauth' | 'totp';
type OAuthProvider = 'github' | 'google' | 'microsoft';

type ConfigOverride = {
  enabledAuthStrategies?: AuthStrategy[];
  enabledOAuthProviders?: OAuthProvider[];
  selfRegistration?: boolean;
};

/**
 * Mock the global fetch request to avoid actual network calls during tests.
 */
export function mockFetchRequest() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input) => {
      // Handle Request objects (like those from rate limiter)
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

/**
 * Clear the database by truncating all test-related tables.
 * Uses TRUNCATE CASCADE which is much faster than individual DELETEs.
 * Also resets mock enforcers to prevent conflicts with unique values.
 */
export async function clearDatabase() {
  // Reset mock enforcers so unique values don't conflict across tests
  resetUserMockEnforcers();
  resetOrganizationMockEnforcers();

  await db.execute(sql`TRUNCATE TABLE 
    sessions, tokens, passkeys, oauth_accounts, emails, users 
    CASCADE`);
}

/**
 * Mock factory for rate limiter core module.
 * Use at top level: vi.mock('#/middlewares/rate-limiter/core', rateLimiterCoreMock)
 */
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

/**
 * Mock factory for rate limiter helpers module.
 * Use at top level: vi.mock('#/middlewares/rate-limiter/helpers', rateLimiterHelpersMock)
 */
export const rateLimiterHelpersMock = async (importOriginal: () => Promise<Record<string, unknown>>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    checkIpRateLimitStatus: vi.fn().mockResolvedValue({ isLimited: false }),
    checkRateLimitStatus: vi.fn().mockResolvedValue({ isLimited: false }),
  };
};

/**
 * Mock factory for Arctic library.
 * Use at top level: vi.mock('arctic', arcticMock)
 */
export const arcticMock = async () => {
  const actual = await vi.importActual('arctic');
  return {
    ...actual,
    generateState: () => `mock-state-${Math.random().toString(36).substring(7)}`,
    generateCodeVerifier: () => `mock-code-verifier-${Math.random().toString(36).substring(7)}`,
  };
};

/**
 * Modifies the app configuration for testing purposes.
 *
 * @param overrides - Instructions for what to enable/disable.
 */
export function setTestConfig(overrides: ConfigOverride) {
  if (overrides.enabledAuthStrategies) {
    (appConfig as unknown as { enabledAuthStrategies: string[] }).enabledAuthStrategies =
      overrides.enabledAuthStrategies;
  }

  if (overrides.enabledOAuthProviders) {
    // Config type is narrowed by `satisfies` in default-config, so cast needed to widen
    (appConfig as unknown as { enabledOAuthProviders: string[] }).enabledOAuthProviders =
      overrides.enabledOAuthProviders;
  }

  if (overrides.selfRegistration !== undefined) {
    (appConfig.has as { selfRegistration: boolean }).selfRegistration = overrides.selfRegistration;
  }
}

/**
 * Mock factory for cookie helpers (used in OAuth tests).
 * Returns an in-memory cookie store with set/get/delete.
 * Use at top level: vi.mock('#/modules/auth/general/helpers/cookie', async () => (await import('../test-utils')).cookieMock())
 * Call clearCookieStore() in afterEach to reset between tests.
 * Access mockCookieStore directly to pre-populate cookies in tests.
 */
export const mockCookieStore = new Map<string, string>();
export const clearCookieStore = () => mockCookieStore.clear();

export const cookieMock = () => ({
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

/**
 * Mock factory for session helpers (used in OAuth tests).
 * Use at top level: vi.mock('#/modules/auth/general/helpers/session', sessionMock)
 */
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
