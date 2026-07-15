import pc from 'picocolors';
import { logMigrationResult, upsertMigration } from './helpers/drizzle-utils';
import type { GenerateScript } from '../types';

/**
 * Converts ephemeral/regenerable tables to UNLOGGED to skip WAL writes. These tolerate
 * truncation on unclean shutdown:
 * - rate_limits: clients get a fresh window
 * - user_counters, channel_counters, product_counters: rebuilt from source data on startup
 *
 * Idempotent: checks pg_class.relpersistence before altering.
 */

const unloggedTables = ['rate_limits', 'user_counters', 'channel_counters', 'product_counters'];

async function run() {
  const alterStatements = unloggedTables
    .map(
      (t) => `  IF (SELECT relpersistence FROM pg_class WHERE relname = '${t}') != 'u' THEN
    ALTER TABLE ${t} SET UNLOGGED;
    RAISE NOTICE '${t} set to UNLOGGED';
  END IF;`,
    )
    .join('\n\n');

  const migrationSql = `-- UNLOGGED Tables Setup
-- Converts ephemeral counter/rate-limit tables to UNLOGGED (skip WAL writes).
-- Idempotent: only alters tables not already UNLOGGED.
-- Gracefully skips if required roles are not yet created.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') THEN
    RAISE NOTICE 'Skipping UNLOGGED setup - roles not available.';
    RETURN;
  END IF;

${alterStatements}

  RAISE NOTICE 'UNLOGGED setup complete.';
END $$;
`;

  const result = upsertMigration('unlogged_setup', migrationSql);
  logMigrationResult(result, 'UNLOGGED setup');

  console.info('');
  console.info(`  ${pc.greenBright('UNLOGGED tables:')} ${unloggedTables.join(', ')}`);
}

export const generateConfig: GenerateScript = {
  name: 'UNLOGGED',
  type: 'migration',
  run,
};
