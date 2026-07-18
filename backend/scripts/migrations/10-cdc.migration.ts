import pc from 'picocolors';
import { getTableName } from 'drizzle-orm';
import { publicationRowFilter } from '#/db/utils/publication-filter';
import { resourceTables } from '#/tables';
import { entityTables } from '#/tables';
import { CDC_PUBLICATION_NAME, CDC_SLOT_NAME } from '../../../cdc/src/constants';
import type { SideEffectBlock, SideEffectProducer } from '../types';

interface TableSpec {
  tableName: string;
  /** Publication row filter (draft boundary), e.g. `published_at IS NOT NULL`. */
  rowFilter?: string;
}

/**
 * Publication column lists are incompatible with REPLICA IDENTITY FULL (PG error 42P10).
 * Since the CDC worker needs REPLICA IDENTITY FULL for old-row diffs, we publish all columns.
 * Large columns are still stripped from WS payloads via cdcExcludeColumnLengthThreshold in the activity service.
 *
 * Draft-lifecycle product tables get a ROW FILTER (PG 17+, see infra/README): the
 * replication stream then contains only the synced world — publish edges arrive as
 * INSERTs, unpublishes as DELETEs, draft edits never arrive (`publication-filter.ts`).
 */
function buildTableSpecs(): TableSpec[] {
  const entitySpecs = Object.entries(entityTables).map(([entityType, table]) => ({
    tableName: getTableName(table),
    rowFilter: publicationRowFilter(entityType, table),
  }));
  const resourceSpecs = Object.values(resourceTables).map((table) => ({ tableName: getTableName(table) }));
  return [...entitySpecs, ...resourceSpecs];
}

async function run(): Promise<SideEffectBlock> {
  const tableSpecs = buildTableSpecs();

  if (tableSpecs.length === 0) {
    console.error(pc.bold(pc.redBright('✘ No tracked tables found for CDC!')));
    console.error('  Please ensure that entityTables and resourceTables are defined correctly.');
    process.exit(1);
  }

  const trackedTableNames = tableSpecs.map((s) => s.tableName);
  const filteredTables = tableSpecs.filter((s) => s.rowFilter);

  // Table list for CREATE/ALTER PUBLICATION: no column lists; per-table WHERE for
  // draft-lifecycle product tables (the draft boundary lives at the source).
  const tableList = tableSpecs.map((s) => (s.rowFilter ? `${s.tableName} WHERE (${s.rowFilter})` : s.tableName)).join(', ');

  const migrationSql = `-- CDC (Change Data Capture) Setup
-- Sets up PostgreSQL logical replication for the activities CDC worker.
-- Requires: wal_level=logical (see compose.yaml)
-- Gracefully skips if logical replication is not available.

DO $$
BEGIN
  -- Check if pg_publication is available
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relname = 'pg_publication') THEN
    RAISE NOTICE 'Logical replication not available - skipping CDC setup.';
    RETURN;
  END IF;

  -- 1. Create or update publication
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = '${CDC_PUBLICATION_NAME}') THEN
      CREATE PUBLICATION ${CDC_PUBLICATION_NAME} FOR TABLE ${tableList};
      RAISE NOTICE 'Created publication ${CDC_PUBLICATION_NAME}';
    ELSE
      -- Publication exists — replace with current table list
      RAISE NOTICE 'Publication ${CDC_PUBLICATION_NAME} already exists, syncing tables...';
      ALTER PUBLICATION ${CDC_PUBLICATION_NAME} SET TABLE ${tableList};
      RAISE NOTICE 'Publication tables synced';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Publication setup failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  END;

  -- 2. Set REPLICA IDENTITY FULL (separate block)
  BEGIN
${trackedTableNames.map((table) => `    ALTER TABLE ${table} REPLICA IDENTITY FULL;`).join('\n')}
    RAISE NOTICE 'REPLICA IDENTITY FULL set on all tracked tables';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'REPLICA IDENTITY setup failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  END;

  -- Replication slot ('${CDC_SLOT_NAME}') is NOT created here: the migrator applies all
  -- migrations in one transaction, and logical slot creation always fails in a transaction
  -- that has performed writes. The CDC worker creates the slot at startup
  -- (cdc/src/pipeline/replication.ts).

  RAISE NOTICE 'CDC setup complete.';
END $$;
`;

  return {
    tag: 'cdc_setup',
    title: 'CDC — publication, replica identity, replication slot',
    sql: migrationSql,
    notes: [
      `Tracked tables (${trackedTableNames.length}): ${trackedTableNames.join(', ')}`,
      `Draft row filters (${filteredTables.length}): ${filteredTables.map((s) => s.tableName).join(', ') || 'none'}`,
    ],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'CDC',
  produce: run,
};
