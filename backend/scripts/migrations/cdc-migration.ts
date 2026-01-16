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
import { resourceTables } from '#/activities-config';
import { entityTables } from '#/entity-table-config';
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

-- Create publication for tracked tables (excludes 'activities' to prevent loops)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = '${CDC_PUBLICATION_NAME}') THEN
    CREATE PUBLICATION ${CDC_PUBLICATION_NAME} FOR TABLE ${tableList};
    RAISE NOTICE 'Created publication ${CDC_PUBLICATION_NAME}';
  ELSE
    RAISE NOTICE 'Publication ${CDC_PUBLICATION_NAME} already exists';
  END IF;
END $$;

-- Set REPLICA IDENTITY FULL to get old row values on UPDATE/DELETE
${trackedTableNames.map((table) => `ALTER TABLE ${table} REPLICA IDENTITY FULL;`).join('\n')}

-- Note: Replication slot '${CDC_SLOT_NAME}' is created by the CDC worker on startup
`;

// Use shared migration utility
const result = upsertMigration('cdc_setup', migrationSql);
logMigrationResult(result, 'CDC setup');

console.info('');
console.info(`  ${pc.bold(pc.greenBright('Tracked tables:'))}`);
for (const table of trackedTableNames) {
  console.info(`    - ${table}`);
}
