import type { SideEffectBlock, SideEffectProducer } from '../types';

// Partition configuration

interface PartitionConfig {
  name: string;
  /** Column to partition by */
  partitionColumn: string;
  /** Partition interval (e.g., '1 week', '1 month') */
  interval: string;
  /** Retention period (e.g., '30 days', '90 days'). Null = no retention (keep indefinitely). */
  retention: string | null;
}

// Catalog cloning avoids a duplicate schema definition. The parity test verifies each table,
// partition-column PK, and required non-null control column against Drizzle metadata.
export const partitionConfigs: PartitionConfig[] = [
  { name: 'sessions', partitionColumn: 'expires_at', interval: '1 week', retention: '30 days' },
  { name: 'tokens', partitionColumn: 'expires_at', interval: '1 week', retention: '30 days' },
  { name: 'unsubscribe_tokens', partitionColumn: 'created_at', interval: '1 month', retention: '90 days' },
  { name: 'activities', partitionColumn: 'created_at', interval: '1 week', retention: '90 days' },
  { name: 'seen_by', partitionColumn: 'created_at', interval: '1 week', retention: '90 days' },
];

/**
 * Generates an idempotent, catalog-driven conversion to a pg_partman table.
 * Constraints, indexes, and triggers are captured and replayed after the source table is
 * dropped because their schema-wide names would otherwise collide. Existing partitions
 * only receive refreshed retention settings.
 */
function generateTablePartitionSql(config: PartitionConfig): string {
  const retentionSql = `
    UPDATE partman.part_config SET
      retention = ${config.retention ? `'${config.retention}'` : 'NULL'},
      retention_keep_table = ${config.retention ? 'false' : 'true'},
      infinite_time_partitions = true`;

  return `  -- ==========================================================================
  -- ${config.name.toUpperCase()}: convert to partitioned by RANGE (${config.partitionColumn})
  -- ==========================================================================

  IF EXISTS (
    SELECT 1 FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid = pt.partrelid
    WHERE c.relname = '${config.name}' AND c.relnamespace = 'public'::regnamespace
  ) THEN
    -- Already partitioned: refresh retention config only
${retentionSql}
    WHERE parent_table = 'public.${config.name}';
    RAISE NOTICE '${config.name} already partitioned — config updated, skipping conversion';
  ELSE
    -- 1a. Guard: PK must include the partition column
    SELECT array_agg(a.attname::text ORDER BY x.ord) INTO pk_cols
      FROM pg_constraint con
      JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS x(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = x.attnum
      WHERE con.conrelid = 'public.${config.name}'::regclass AND con.contype = 'p';
    IF pk_cols IS NULL OR NOT ('${config.partitionColumn}' = ANY(pk_cols)) THEN
      RAISE EXCEPTION '${config.name}: primary key (%) must include partition column ${config.partitionColumn}', pk_cols;
    END IF;

    -- 1b. Guard: no non-PK unique constraints (cannot exist on the partitioned table)
    IF EXISTS (
      SELECT 1 FROM pg_constraint con
      WHERE con.conrelid = 'public.${config.name}'::regclass AND con.contype = 'u'
    ) THEN
      RAISE EXCEPTION '${config.name}: unique constraints other than the PK cannot be carried onto a table partitioned by ${config.partitionColumn}';
    END IF;

    -- 2. Capture PK, FKs, non-constraint indexes, and triggers for replay after the
    --    swap (earlier blocks may already have attached triggers, e.g. immutability)
    SELECT pg_get_constraintdef(con.oid) INTO pk_def
      FROM pg_constraint con
      WHERE con.conrelid = 'public.${config.name}'::regclass AND con.contype = 'p';
    SELECT COALESCE(array_agg(format('ALTER TABLE public.${config.name} ADD CONSTRAINT %I %s', con.conname, pg_get_constraintdef(con.oid))), '{}')
      INTO fk_defs
      FROM pg_constraint con
      WHERE con.conrelid = 'public.${config.name}'::regclass AND con.contype = 'f';
    SELECT COALESCE(array_agg(pg_get_indexdef(i.indexrelid)), '{}') INTO idx_defs
      FROM pg_index i
      WHERE i.indrelid = 'public.${config.name}'::regclass
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid);
    SELECT COALESCE(array_agg(pg_get_triggerdef(t.oid)), '{}') INTO trg_defs
      FROM pg_trigger t
      WHERE t.tgrelid = 'public.${config.name}'::regclass AND NOT t.tgisinternal;

    -- 3. Move the original aside and create the partitioned table directly under the
    --    final name, so partman child partitions get clean names (${config.name}_p...).
    --    The original's indexes keep their (schema-wide) names — safe, because no index
    --    is created on the new table until the old one is dropped in step 6.
    ALTER TABLE ${config.name} RENAME TO ${config.name}_old;
    EXECUTE 'CREATE TABLE ${config.name} (LIKE ${config.name}_old INCLUDING ALL EXCLUDING INDEXES) PARTITION BY RANGE (${config.partitionColumn})';

    -- 4. Register with pg_partman (${config.interval} partitions + DEFAULT) and configure
    --    retention${config.retention ? ` (${config.retention}, drop old partitions)` : ' (NONE — records kept indefinitely)'}
    PERFORM partman.create_parent(
      p_parent_table => 'public.${config.name}',
      p_control => '${config.partitionColumn}',
      p_interval => '${config.interval}'
    );
${retentionSql}
    WHERE parent_table = 'public.${config.name}';

    -- 5. Copy data (identical column order via LIKE; out-of-range rows go to DEFAULT)
    EXECUTE 'INSERT INTO ${config.name} SELECT * FROM ${config.name}_old';

    -- 6. Drop old (frees index/constraint names), replay PK + FKs + indexes + triggers
    DROP TABLE ${config.name}_old;

    EXECUTE format('ALTER TABLE public.${config.name} ADD %s', pk_def);
    FOREACH ddl IN ARRAY fk_defs LOOP EXECUTE ddl; END LOOP;
    FOREACH ddl IN ARRAY idx_defs LOOP EXECUTE ddl; END LOOP;
    FOREACH ddl IN ARRAY trg_defs LOOP EXECUTE ddl; END LOOP;

    RAISE NOTICE '${config.name} converted to partitioned';
  END IF;
`;
}

async function run(): Promise<SideEffectBlock> {
  const tableSetupSql = partitionConfigs.map(generateTablePartitionSql).join('\n');

  const migrationSql = `-- =============================================================================
-- Migration: pg_partman Setup for Token/Session/Activity/SeenBy Tables
-- =============================================================================
-- Converts sessions, tokens, unsubscribe_tokens, activities, and seen_by to
-- partitioned tables managed by pg_partman for automatic time-based cleanup.
--
-- IMPORTANT: This creates a schema drift between Drizzle and the actual DB:
-- - Drizzle sees: regular tables with composite PKs
-- - PostgreSQL has: partitioned tables with composite PKs
--
-- This is intentional. Standard ALTER TABLE operations (ADD COLUMN, etc.)
-- work fine on partitioned tables. Only avoid operations that recreate tables.
--
${partitionConfigs
  .map((c) => `-- - ${c.name}: partitioned by ${c.partitionColumn} (${c.interval}, ${c.retention ?? 'indefinite'} retention)`)
  .join('\n')}
--
-- Skips ONLY when the pg_partman extension cannot be installed (managed providers
-- without it); the tables then grow unbounded with manual cleanup. Any failure
-- DURING conversion aborts the migration loudly — a swallowed error here previously
-- shipped databases where nothing was partitioned while everyone believed it was.
-- run_maintenance() is scheduled in-process daily (see src/lib/db-maintenance.ts).
-- =============================================================================

DO $$
DECLARE
  ddl text;
  pk_def text;
  pk_cols text[];
  idx_defs text[];
  fk_defs text[];
  trg_defs text[];
BEGIN
  -- Graceful skip only for extension availability
  BEGIN
    CREATE SCHEMA IF NOT EXISTS partman;
    CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_partman not available - skipping partition setup. Manual cleanup will be used.';
    RETURN;
  END;

${tableSetupSql}
  RAISE NOTICE 'pg_partman setup complete.';
END $$;
`;

  return {
    tag: 'partman_setup',
    title: 'pg_partman — partitioned tables',
    sql: migrationSql,
    notes: partitionConfigs.map(
      (config) => `${config.name}: ${config.interval} partitions, ${config.retention ?? 'indefinite'} retention`,
    ),
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Partman',
  produce: run,
};
