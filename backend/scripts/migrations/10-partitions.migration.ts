import { getTableName } from 'drizzle-orm';
import { appPartitionConfigs } from '#/db/product-tables';
import type { PartitionConfig } from '#/tables';
import type { SideEffectBlock, SideEffectProducer } from '../types';

// Catalog cloning avoids a duplicate schema definition. The parity test verifies each table,
// partition-column PK, and required non-null control column against Drizzle metadata.
const cellaPartitionConfigs: PartitionConfig[] = [
  { name: 'activities', partitionColumn: 'created_at', interval: '1 week', retention: '90 days' },
  { name: 'seen_by', partitionColumn: 'created_at', interval: '1 week', retention: '90 days' },
  // Per-user notification inbox, aligned with seen_by so retention needs no sweep job.
  { name: 'notifications', partitionColumn: 'created_at', interval: '1 week', retention: '90 days' },
];

/** Cella's entries followed by the app's (`appPartitionConfigs` in product-tables.ts); the verify block and parity test read this list. */
export const partitionConfigs: PartitionConfig[] = [
  ...cellaPartitionConfigs,
  ...appPartitionConfigs.map(({ table, ...config }) => ({ name: getTableName(table), ...config })),
];

/**
 * Small tables swept row by row by the same procedure: too small to justify partitions, and a plain
 * `id` primary key keeps them referenceable. Retention counts from the named column.
 */
const sweepConfigs: { name: string; column: string; retention: string }[] = [
  { name: 'sessions', column: 'expires_at', retention: '30 days' },
  { name: 'tokens', column: 'expires_at', retention: '30 days' },
  { name: 'unsubscribe_tokens', column: 'created_at', retention: '90 days' },
];

/** The procedure pg_cron calls nightly (scheduled by scripts/db/schedule-partition-maintenance.ts). */
export const MAINTENANCE_PROCEDURE = 'maintain_partitions';

/**
 * Generates an idempotent, catalog-driven conversion of a table to native range partitions.
 * Constraints, indexes, and triggers are captured and replayed after the source table is
 * dropped because their schema-wide names would otherwise collide. A DEFAULT partition catches
 * rows outside every range; `maintain_partitions()` moves them into place.
 */
function generateTablePartitionSql(config: PartitionConfig): string {
  return `  -- ==========================================================================
  -- ${config.name.toUpperCase()}: convert to partitioned by RANGE (${config.partitionColumn})
  -- ==========================================================================

  IF NOT EXISTS (
    SELECT 1 FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid = pt.partrelid
    WHERE c.relname = '${config.name}' AND c.relnamespace = 'public'::regnamespace
  ) THEN
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
    --    final name, so child partitions get clean names (${config.name}_p...).
    --    The original's indexes keep their (schema-wide) names: safe, because no index
    --    is created on the new table until the old one is dropped in step 5.
    ALTER TABLE ${config.name} RENAME TO ${config.name}_old;
    EXECUTE 'CREATE TABLE ${config.name} (LIKE ${config.name}_old INCLUDING ALL EXCLUDING INDEXES) PARTITION BY RANGE (${config.partitionColumn})';
    EXECUTE 'CREATE TABLE ${config.name}_default PARTITION OF ${config.name} DEFAULT';

    -- 4. Copy data (identical column order via LIKE); every row lands in DEFAULT until
    --    maintain_partitions() below creates the current ranges and moves rows over
    EXECUTE 'INSERT INTO ${config.name} SELECT * FROM ${config.name}_old';

    -- 5. Drop old (frees index/constraint names), replay PK + FKs + indexes + triggers
    DROP TABLE ${config.name}_old;

    EXECUTE format('ALTER TABLE public.${config.name} ADD %s', pk_def);
    FOREACH ddl IN ARRAY fk_defs LOOP EXECUTE ddl; END LOOP;
    FOREACH ddl IN ARRAY idx_defs LOOP EXECUTE ddl; END LOOP;
    FOREACH ddl IN ARRAY trg_defs LOOP EXECUTE ddl; END LOOP;

    RAISE NOTICE '${config.name} converted to partitioned';
  END IF;
`;
}

/** One `(table, column, interval, retention)` row per config for the procedure's VALUES list. */
const configRow = (c: PartitionConfig): string =>
  `('${c.name}', '${c.partitionColumn}', interval '${c.interval}', ${c.retention ? `interval '${c.retention}'` : 'NULL::interval'})`;

/**
 * The maintenance procedure: drops partitions older than the retention window, trims the DEFAULT
 * partition, then creates partitions from the newest upper bound through two intervals ahead.
 * Rows that landed in DEFAULT for a new range are moved out first, because Postgres refuses a
 * partition whose range the DEFAULT partition already holds rows for. Ends with the row sweeps.
 */
function generateMaintenanceProcedureSql(): string {
  return `CREATE OR REPLACE PROCEDURE public.${MAINTENANCE_PROCEDURE}() LANGUAGE plpgsql AS $proc$
DECLARE
  cfg record;
  sw record;
  child record;
  lo timestamptz;
  hi timestamptz;
  part text;
BEGIN
  FOR cfg IN
    SELECT * FROM (VALUES
      ${partitionConfigs.map(configRow).join(',\n      ')}
    ) AS t(tbl, col, step, keep)
  LOOP
    lo := NULL;
    FOR child IN
      SELECT c.relname,
             substring(pg_get_expr(c.relpartbound, c.oid) from 'TO \\(''([^'']+)''\\)')::timestamptz AS hi
      FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
      WHERE i.inhparent = format('public.%I', cfg.tbl)::regclass
    LOOP
      IF child.hi IS NULL THEN
        -- DEFAULT partition: no range to drop, so age out its rows directly
        IF cfg.keep IS NOT NULL THEN
          EXECUTE format('DELETE FROM %I WHERE %I < now() - $1', child.relname, cfg.col) USING cfg.keep;
        END IF;
      ELSIF cfg.keep IS NOT NULL AND child.hi < now() - cfg.keep THEN
        EXECUTE format('DROP TABLE %I', child.relname);
      ELSE
        lo := greatest(lo, child.hi);
      END IF;
    END LOOP;

    -- Continue from the newest live partition, or start a fresh series at the current period
    IF lo IS NULL OR lo < now() - coalesce(cfg.keep, interval '0') THEN
      lo := date_trunc(CASE WHEN cfg.step >= interval '1 month' THEN 'month' ELSE 'week' END, now());
    END IF;

    WHILE lo < now() + 2 * cfg.step LOOP
      hi := lo + cfg.step;
      part := format('%s_p%s', cfg.tbl, to_char(lo, 'YYYYMMDD'));
      EXECUTE format('CREATE TEMP TABLE moved (LIKE %I)', cfg.tbl);
      EXECUTE format('WITH d AS (DELETE FROM %I WHERE %I >= $1 AND %I < $2 RETURNING *) INSERT INTO moved SELECT * FROM d',
        cfg.tbl || '_default', cfg.col, cfg.col) USING lo, hi;
      EXECUTE format('CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)', part, cfg.tbl, lo, hi);
      EXECUTE format('INSERT INTO %I SELECT * FROM moved', cfg.tbl);
      DROP TABLE moved;
      lo := hi;
    END LOOP;
  END LOOP;

  -- Plain tables: retention by DELETE
  FOR sw IN
    SELECT * FROM (VALUES
      ${sweepConfigs.map((c) => `('${c.name}', '${c.column}', interval '${c.retention}')`).join(',\n      ')}
    ) AS t(tbl, col, keep)
  LOOP
    EXECUTE format('DELETE FROM %I WHERE %I < now() - $1', sw.tbl, sw.col) USING sw.keep;
  END LOOP;
END $proc$;`;
}

async function run(): Promise<SideEffectBlock> {
  const tableSetupSql = partitionConfigs.map(generateTablePartitionSql).join('\n');

  const migrationSql = `-- =============================================================================
-- Migration: Time-partitioned tables with in-database retention
-- =============================================================================
-- Converts the tables below to native range partitions and installs
-- maintain_partitions(), which pg_cron runs nightly (see
-- scripts/db/schedule-partition-maintenance.ts) to create partitions ahead
-- and drop those past retention. No extension is needed in this database.
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
-- Any failure aborts the migration loudly: a swallowed error here previously
-- shipped databases where nothing was partitioned while everyone believed it was.
-- =============================================================================

-- pg_partman managed these partitions before; its partitions stay, its config goes.
DROP EXTENSION IF EXISTS pg_partman CASCADE;
DROP SCHEMA IF EXISTS partman CASCADE;

${generateMaintenanceProcedureSql()}

DO $$
DECLARE
  ddl text;
  pk_def text;
  pk_cols text[];
  idx_defs text[];
  fk_defs text[];
  trg_defs text[];
BEGIN
${tableSetupSql}
  CALL public.${MAINTENANCE_PROCEDURE}();
  RAISE NOTICE 'Partition setup complete.';
END $$;
`;

  return {
    tag: 'partition_setup',
    title: 'Partitioned tables and maintain_partitions()',
    sql: migrationSql,
    notes: partitionConfigs.map(
      (config) => `${config.name}: ${config.interval} partitions, ${config.retention ?? 'indefinite'} retention`,
    ),
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Partitions',
  produce: run,
};
