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
 * Use the exported mock factory functions (rateLimiterCoreMock, rateLimiterHelpersMock, arcticMock)
 * in your top-level vi.mock() calls instead of wrapping them in helper functions.
 */

import { sql } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { appConfig } from 'shared';
import { vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { resetOrganizationMockEnforcers } from '../mocks/mock-organization';
import { resetUserMockEnforcers } from '../mocks/mock-user';

/**
 * Types
 */
type AuthStrategy = 'password' | 'passkey' | 'oauth' | 'totp';
type OAuthProvider = 'github' | 'google' | 'microsoft';

type ConfigOverride = {
  enabledAuthStrategies?: AuthStrategy[];
  enabledOAuthProviders?: OAuthProvider[];
  registrationEnabled?: boolean;
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
    sessions, tokens, passkeys, passwords, oauth_accounts, emails, users 
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
    appConfig.enabledAuthStrategies = overrides.enabledAuthStrategies;
  }

  if (overrides.enabledOAuthProviders) {
    // Config type is narrowed by `satisfies` in default-config, so cast needed to widen
    appConfig.enabledOAuthProviders = overrides.enabledOAuthProviders as typeof appConfig.enabledOAuthProviders;
  }

  if (overrides.registrationEnabled !== undefined) {
    (appConfig.has as { registrationEnabled: boolean }).registrationEnabled = overrides.registrationEnabled;
  }
}
