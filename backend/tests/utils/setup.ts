/**
 * Test setup utilities for configuring test environments.
 *
 * This file contains helper functions to:
 * - Mock global behaviors like `fetch`
 * - Migrate the test database
 * - Clean up the users table
 * - Dynamically enable/disable config flags (e.g., auth strategies)
 *
 * These functions are intended to be used in test files to keep setup DRY and consistent.
 */
import { vi } from 'vitest';
import path from 'node:path';
import { migrate } from 'drizzle-orm/pglite/migrator';

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
 * @param {any} db - The database instance.
 * @param {string} migrationsFolder - The folder containing migration files.
 */
export async function migrateDatabase(db: any, migrationsFolder = 'drizzle') {
  return migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), migrationsFolder),
  });
}

/**
 * Clear the users table in the database.
 * @param {any} db - The database instance.
 * @param {any} usersTable - The users table schema.
 */
export async function clearUsersTable(db: any, usersTable: any) {
  return db.delete(usersTable);
}

/**
 * Disable the specified authentication strategy in the configuration.
 * @param {any} config - The configuration object.
 * @param {string} strategy - The authentication strategy to disable.
 */
export function disableAuthStrategy(config: any, strategy: string) {
  config.enabledAuthStrategies = config.enabledAuthStrategies.filter((s: string) => s !== strategy);
}

/**
 * Enable the specified authentication strategy in the configuration.
 * @param {any} config - The configuration object.
 * @param {string} strategy - The authentication strategy to enable.
 */
export function enableAuthStrategy(config: any, strategy: string) {
  if (!config.enabledAuthStrategies.includes(strategy)) {
    config.enabledAuthStrategies.push(strategy);
  }
}

/**
 * Disable user registration in the configuration.
 * @param {any} config - The configuration object.
 */
export function disableRegistration(config: any) {
  config.has.registrationEnabled = false;
}

/**
 * Enable user registration in the configuration.
 * @param {any} config - The configuration object.
 */
export function enableRegistration(config: any) {
  config.has.registrationEnabled = true;
}