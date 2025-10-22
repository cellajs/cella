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
import { vi } from 'vitest';
import path from 'node:path';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { usersTable } from '#/db/schema/users';
import { emailsTable } from '#/db/schema/emails';
import { tokensTable } from '#/db/schema/tokens';
import { db } from '#/db/db';
import { appConfig } from 'config';

/**
 * Types
 */
type AuthStrategy = 'password' | 'passkey' | 'oauth';

type ConfigOverride = {
  enabledAuthStrategies?: AuthStrategy[];
  registrationEnabled?: boolean;
};

// TODO this seems not very scalable/maintainable? why not get the actual app from server.ts?
export async function getAuthApp() {
  const { default: baseApp } = await import('#/server');
  const { default: authGeneralRouteHandlers } = await import('#/modules/auth/general/handlers');
  const { default: authTotpsRouteHandlers } = await import('#/modules/auth/totps/handlers');
  const { default: authPasswordsRouteHandlers } = await import('#/modules/auth/passwords/handlers');

  return baseApp
    .route('/auth', authGeneralRouteHandlers)
    .route('/auth/totps', authTotpsRouteHandlers)
    .route('/auth', authPasswordsRouteHandlers)
}

/**
 * Mock the global fetch request to avoid actual network calls during tests.
 */
export function mockFetchRequest() {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '',
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
  await db.delete(tokensTable);
  await db.delete(emailsTable);
  await db.delete(usersTable);
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

  if (overrides.registrationEnabled !== undefined) {
    appConfig.has.registrationEnabled = overrides.registrationEnabled;
  }
}