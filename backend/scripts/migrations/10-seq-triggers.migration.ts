import pc from 'picocolors';
import { getTableName } from 'drizzle-orm';
import { appConfig, hierarchy } from 'shared';
import { entityTables } from '#/table-config';
import { logMigrationResult, upsertMigration } from './helpers/drizzle-utils';
import type { GenerateScript } from '../types';

/**
 * Seq Triggers Migration
 *
 * Creates the `stamp_entity_seq()` trigger function and applies it to all
 * product entity tables. The trigger atomically:
 *   1. Increments `context_counters.counts['s:<entityType>']` via upsert
 *   2. Stamps the new value as `seq` on the entity row
 *
 * This is the single source of truth for per-(context, entityType) sequences:
 *   - Entity row `seq` enables efficient delta queries (`WHERE seq > ?`)
 *   - `context_counters` high watermark enables O(1) catchup gap detection
 *
 * Hierarchy-aware: uses the entity's direct parent column as the context key.
 * For example, if attachment.parent = 'organization', key = organization_id.
 * If task.parent = 'project', key = project_id.
 * Parentless entities use 'public:<entityType>' as context key.
 */
async function run() {
  // Build table configs from hierarchy + entityTables
  const tableConfigs = appConfig.productEntityTypes.map((entityType) => {
    const table = entityTables[entityType as keyof typeof entityTables];
    if (!table) throw new Error(`No table found for product entity type: ${entityType}`);

    const parentType = hierarchy.getParent(entityType);
    // Convert parent type to snake_case column name (e.g., 'organization' → 'organization_id')
    const parentColumn = parentType ? `${parentType.replace(/([A-Z])/g, '_$1').toLowerCase()}_id` : null;

    return {
      entityType,
      tableName: getTableName(table),
      parentColumn, // null for parentless, 'organization_id' for org-scoped, 'project_id' for project-scoped, etc.
    };
  });

  if (tableConfigs.length === 0) {
    console.error(pc.bold(pc.redBright('✘ No product entity tables found for seq triggers!')));
    process.exit(1);
  }

  // Generate trigger SQL for each table
  const triggersSql = tableConfigs.map(({ tableName, parentColumn }) => {
    // Pass the parent column name as trigger argument, or 'public' for parentless entities
    const triggerArg = parentColumn ?? 'public';
    return `    EXECUTE 'DROP TRIGGER IF EXISTS trg_stamp_seq ON ${tableName}';
    EXECUTE 'CREATE TRIGGER trg_stamp_seq BEFORE INSERT OR UPDATE ON ${tableName} FOR EACH ROW EXECUTE FUNCTION stamp_entity_seq(''${triggerArg}'')';`;
  }).join('\n');

  const migrationSql = `-- Entity Seq Triggers Setup
-- Stamps seq on product entity rows and updates context_counters atomically.
-- Used for delta sync: clients query entities with seq > lastKnownSeq.
-- Hierarchy-aware: uses the entity's direct parent column as context key.

-- Trigger function: shared by all product entity tables
-- TG_ARGV[0] is the parent column name (e.g., 'organization_id', 'project_id')
-- or 'public' for parentless entities.
CREATE OR REPLACE FUNCTION stamp_entity_seq()
RETURNS trigger AS $$
DECLARE
  ctx_key TEXT;
  entity_type TEXT;
  seq_key TEXT;
  new_seq BIGINT;
BEGIN
  entity_type := NEW.entity_type;

  -- Determine context key from hierarchy parent column or public prefix
  IF TG_ARGV[0] = 'public' THEN
    ctx_key := 'public:' || entity_type;
  ELSE
    -- Dynamically read the parent column value (e.g., NEW.organization_id, NEW.project_id)
    EXECUTE format('SELECT ($1).%I', TG_ARGV[0]) INTO ctx_key USING NEW;
    -- Fallback: if parent column is NULL (e.g., attachment without project), use organization_id
    IF ctx_key IS NULL THEN
      EXECUTE 'SELECT ($1).organization_id' INTO ctx_key USING NEW;
    END IF;
  END IF;

  seq_key := 's:' || entity_type;

  -- Atomic upsert: increment counts['s:<entityType>'] and return new value
  INSERT INTO context_counters (context_key, counts, updated_at)
  VALUES (ctx_key, jsonb_build_object(seq_key, 1), now())
  ON CONFLICT (context_key) DO UPDATE
  SET counts = context_counters.counts || jsonb_build_object(
    seq_key,
    COALESCE((context_counters.counts->>seq_key)::bigint, 0) + 1
  ),
  updated_at = now()
  RETURNING (counts->>seq_key)::bigint INTO new_seq;

  NEW.seq := new_seq;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Apply triggers to product entity tables
DO $$
BEGIN
${triggersSql}

  RAISE NOTICE 'Entity seq triggers setup complete.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Entity seq triggers setup failed: %. Skipping.', SQLERRM;
END $$;
`;

  const result = upsertMigration('seq_triggers_setup', migrationSql);
  logMigrationResult(result, 'Entity seq triggers');

  console.info('');
  console.info(`  ${pc.bold(pc.greenBright('Triggered tables:'))}`);
  for (const { tableName, entityType, parentColumn } of tableConfigs) {
    const scope = parentColumn ? `parent: ${parentColumn}` : 'public';
    console.info(`    - ${tableName} (${entityType}, ${scope})`);
  }
  console.info('');
}

export const generateConfig: GenerateScript = {
  name: 'Entity seq triggers migration',
  type: 'migration',
  run,
};
