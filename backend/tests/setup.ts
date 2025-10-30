/**
 * Test setup utilities for configuring test environments.
 *
 * This file contains helper functions to:
 * - Mock global behaviors like `fetch`
 * - Migrate the test database
 * - Clean up the database (e.g., clear users and emails tables)
 * - Dynamically enable/disable config flags (e.g., auth strategies)
 *
 * These functions are intended to be used in test files to keep setup DRY and consistent.
 */

import path from 'node:path';
import { appConfig } from 'config';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { Context, Next } from 'hono';
import { vi } from 'vitest';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { passkeysTable } from '#/db/schema/passkeys';
import { passwordsTable } from '#/db/schema/passwords';
import { sessionsTable } from '#/db/schema/sessions';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';

/**
 * Types
 */
type AuthStrategy = 'password' | 'passkey' | 'oauth' | 'totp';

type ConfigOverride = {
  enabledAuthStrategies?: AuthStrategy[];
  enabledOAuthProviders?: string[];
  registrationEnabled?: boolean;
};

/**
 * Mock the global fetch request to avoid actual network calls during tests.
 */
export function mockFetchRequest() {
  globalThis.fetch = vi.fn().mockImplementation((input) => {
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
  });
}

/**
 * Migrate the database to the latest schema.
 * @param {string} migrationsFolder - The folder containing migration files.
 */
export async function migrateDatabase(migrationsFolder: string = 'drizzle') {
  return migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), migrationsFolder),
  });
}

/**
 * Clear the database by removing all users and emails.
 */
export async function clearDatabase() {
  await db.delete(sessionsTable);
  await db.delete(tokensTable);
  await db.delete(passkeysTable);
  await db.delete(passwordsTable);
  await db.delete(oauthAccountsTable);
  await db.delete(emailsTable);
  await db.delete(usersTable);
}

/**
 * Mock rate limiter to avoid 429 errors in tests.
 */
export function mockRateLimiter() {
  vi.mock('#/middlewares/rate-limiter/core', () => ({
    rateLimiter: vi.fn().mockReturnValue(async (_: Context, next: Next) => {
      await next();
    }),
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
  }));
}

/**
 * Mock Arctic library functions
 */
export function mockArcticLibrary() {
  vi.mock('arctic', async () => {
    const actual = await vi.importActual('arctic');
    return {
      ...actual,
      generateState: () => 'mock-state-' + Math.random().toString(36).substring(7),
      generateCodeVerifier: () => 'mock-code-verifier-' + Math.random().toString(36).substring(7),
    };
  });
}

/**
 * Modifies the app configuration for testing purposes.
 *
 * @param overrides - Instructions for what to enable/disable.
 */
export function setTestConfig(overrides: ConfigOverride) {
  if (overrides.enabledAuthStrategies) {
    // Maybe not the best way to cast, but config.enabledAuthStrategies is a readonly fixed
    appConfig.enabledAuthStrategies = overrides.enabledAuthStrategies as unknown as typeof appConfig.enabledAuthStrategies;
  }

  if (overrides.enabledOAuthProviders) {
    appConfig.enabledOAuthProviders = overrides.enabledOAuthProviders as unknown as typeof appConfig.enabledOAuthProviders;
  }

  if (overrides.registrationEnabled !== undefined) {
    appConfig.has.registrationEnabled = overrides.registrationEnabled;
  }
}
