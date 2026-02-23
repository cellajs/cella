/**
 * Generate CDC Migration Script
 *
 * This script generates SQL for setting up PostgreSQL logical replication
 * for the CDC (Change Data Capture) worker.
 *
 * Usage:
 *   pnpm generate:cdc-migration
 *
 * The migration is added to Drizzle's migration folder and journal,
 * so it will be applied automatically with other migrations.
 */

import pc from 'picocolors';
import { getTableName } from 'drizzle-orm';
import { resourceTables } from '#/table-config';
import { entityTables } from '#/table-config';
import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME } from '../../../cdc/src/constants';
import { logMigrationResult, upsertMigration } from './helpers/drizzle-utils';

// Build table names directly from backend imports
const trackedTableNames = [
  ...Object.values(entityTables).map((t) => getTableName(t)),
  ...Object.values(resourceTables).map((t) => getTableName(t)),
];

if (trackedTableNames.length === 0) {
  console.error(pc.bold(pc.redBright('✘ No tracked tables found for CDC!')));
  console.error('  Please ensure that entityTables and resourceTables are defined correctly.');
  process.exit(1);
}

const tableList = trackedTableNames.join(', ');

const migrationSql = `-- CDC (Change Data Capture) Setup
-- Sets up PostgreSQL logical replication for the activities CDC worker.
-- Requires: wal_level=logical (see compose.yaml)
-- For PGlite/environments without logical replication: migration is skipped.

DO $$
BEGIN
  -- Check if pg_publication is available (not available in PGlite)
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relname = 'pg_publication') THEN
    RAISE NOTICE 'Logical replication not available - skipping CDC setup (e.g., PGlite).';
    RETURN;
  END IF;

  -- 1. Create publication (separate block so later failures don't roll it back)
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = '${CDC_PUBLICATION_NAME}') THEN
      CREATE PUBLICATION ${CDC_PUBLICATION_NAME} FOR TABLE ${tableList};
      RAISE NOTICE 'Created publication ${CDC_PUBLICATION_NAME}';
    ELSE
      RAISE NOTICE 'Publication ${CDC_PUBLICATION_NAME} already exists';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Publication setup failed: %. Continuing...', SQLERRM;
  END;

  -- 2. Set REPLICA IDENTITY FULL (separate block)
  BEGIN
${trackedTableNames.map((table) => `    ALTER TABLE ${table} REPLICA IDENTITY FULL;`).join('\n')}
    RAISE NOTICE 'REPLICA IDENTITY FULL set on all tracked tables';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'REPLICA IDENTITY setup failed: %. Continuing...', SQLERRM;
  END;

  -- 3. Create replication slot (separate block - may fail on managed providers)
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = '${CDC_SLOT_NAME}') THEN
      PERFORM pg_create_logical_replication_slot('${CDC_SLOT_NAME}', 'pgoutput');
      RAISE NOTICE 'Created replication slot ${CDC_SLOT_NAME}';
    ELSE
      RAISE NOTICE 'Replication slot ${CDC_SLOT_NAME} already exists';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Replication slot setup failed: %. Worker will create it at startup.', SQLERRM;
  END;

  RAISE NOTICE 'CDC setup complete.';
END $$;
`;

// Use shared migration utility
const result = upsertMigration('cdc_setup', migrationSql);
logMigrationResult(result, 'CDC setup');

console.info('');
console.info(`  ${pc.bold(pc.greenBright('Tracked tables:'))}`);
for (const table of trackedTableNames) {
  console.info(`    - ${table}`);
}
console.info('');

