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
import { db } from '#/db/db';

import baseApp from '#/server';
import authRouteHandlers from '#/modules/auth/handlers';
import { config } from 'config';

/**
 * Types
 */
type AuthStrategy = 'password' | 'passkey' | 'oauth';

type ConfigOverride = {
  enabledAuthStrategies?: AuthStrategy[];
  registrationEnabled?: boolean;
};

/**
 * Base application route for authentication.
 * This sets up the authentication routes that can be used in tests.
 */
export const authApp = baseApp.route('/auth', authRouteHandlers);

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
  await db.delete(usersTable);
  await db.delete(emailsTable);
}

/**
 * Modifies the app configuration for testing purposes.
 *
 * @param overrides - Instructions for what to enable/disable.
 */
export function setTestConfig(overrides: ConfigOverride) {
  if (overrides.enabledAuthStrategies) {
    // Maybe not the best way to cast, but config.enabledAuthStrategies is a readonly fixed
    config.enabledAuthStrategies = overrides.enabledAuthStrategies as unknown as typeof config.enabledAuthStrategies;
  }

  if (overrides.registrationEnabled !== undefined) {
    config.has.registrationEnabled = overrides.registrationEnabled;
  }
}