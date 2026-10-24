import { getTableName } from 'drizzle-orm';
import { appConfig } from 'shared';
import { appPartitionConfigs, productTables } from '#/db/product-tables';
import type { PartitionConfig } from '#/tables';
import type { SideEffectBlock, SideEffectProducer } from '../types';

const { retention } = appConfig;

/** A period of `appConfig.retention` as a SQL interval literal. */
const days = (count: number) => `interval '${count} days'`;

// Catalog cloning avoids a duplicate schema definition. The parity test verifies each table,
// partition-column PK, and required non-null control column against Drizzle metadata.
const cellaPartitionConfigs: PartitionConfig[] = [
  { name: 'activities', partitionColumn: 'created_at', interval: '1 week', retention: `${retention.activityDays} days` },
  { name: 'seen_by', partitionColumn: 'created_at', interval: '1 week', retention: `${retention.activityDays} days` },
  // Per-user notification inbox, aligned with seen_by so retention needs no sweep job.
  { name: 'notifications', partitionColumn: 'created_at', interval: '1 week', retention: `${retention.activityDays} days` },
];

/** Cella's entries followed by the app's (`appPartitionConfigs` in product-tables.ts); the verify block and parity test read this list. */
export const partitionConfigs: PartitionConfig[] = [
  ...cellaPartitionConfigs,
  ...appPartitionConfigs.map(({ table, ...config }) => ({ name: getTableName(table), ...config })),
];

/**
 * Plain tables swept row by row by the same procedure: too small to justify partitions, and a plain `id` primary key
 * keeps them referenceable. `aged` is the condition under which a row goes.
 */
const sweepRules: { table: string; aged: string }[] = [
  { table: 'sessions', aged: `expires_at < now() - ${days(retention.sessionDaysAfterExpiry)}` },
  { table: 'tokens', aged: `expires_at < now() - ${days(retention.tokenDaysAfterExpiry)}` },
  { table: 'devices', aged: `last_seen_at < now() - ${days(retention.deviceDaysUnseen)}` },
  {
    table: 'devices',
    aged: `(user_id, device_id_hash) IN (SELECT user_id, device_id_hash FROM (SELECT user_id, device_id_hash,
      row_number() OVER (PARTITION BY user_id ORDER BY last_seen_at DESC) AS position FROM devices) ranked
      WHERE position > ${retention.devicesPerUser})`,
  },
  { table: 'oidc_payloads', aged: `expires_at < now() OR consumed_at < now() - ${days(retention.oidcPayloadDaysAfterUse)}` },
  // Newsletter rows are a standing subscription: they go with an unsubscribe, never with age.
  { table: 'requests', aged: `type IN ('contact', 'waitlist') AND created_at < now() - ${days(retention.requestDays)}` },
  // A held invitation (a draft channel's, never mailed) has no reminded_at and goes with its channel.
  {
    table: 'inactive_memberships',
    aged: `rejected_at < now() - ${days(retention.invitationDays)} OR (rejected_at IS NULL AND reminded_at < now() - ${days(retention.invitationDays)})`,
  },
  { table: 'rate_limits', aged: `expire < now() - ${days(retention.rateLimitDaysAfterWindow)}` },
  { table: 'push_subscriptions', aged: `coalesce(last_seen_at, created_at) < now() - ${days(retention.pushSubscriptionDaysUnseen)}` },
];

/** Product tables, whose tombstones go after `deletedItemsDays`; their deletes feed the deletion queue. */
const tombstoneTables = Object.values(productTables).map((table) => getTableName(table()));

/** Tombstones one batch removes; a commit between batches keeps each transaction small for the CDC worker. */
const tombstoneBatchSize = 1000;

/** The procedure pg_cron calls nightly (scheduled by scripts/db/schedule-retention.ts). */
export const retentionProcedure = 'apply_retention';

/**
 * Generates an idempotent, catalog-driven conversion of a table to native range partitions.
 * Constraints, indexes, and triggers are captured and replayed after the source table is
 * dropped because their schema-wide names would otherwise collide. A DEFAULT partition catches
 * rows outside every range; `apply_retention()` moves them into place.
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
    --    apply_retention() below creates the current ranges and moves rows over
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

/** One product table's tombstone loop inside the procedure. */
const generateTombstoneSql = (table: string): string => `LOOP
    DELETE FROM ${table} t USING (
      SELECT d.ctid FROM ${table} d
      WHERE d.deleted_at < now() - ${days(retention.deletedItemsDays)}
        AND d.seq < coalesce((SELECT (c.counts->>'sequence')::bigint FROM channel_counters c WHERE c.channel_key = d.organization_id::text), 0)
      LIMIT ${tombstoneBatchSize}
    ) due WHERE t.ctid = due.ctid;
    GET DIAGNOSTICS removed = ROW_COUNT;
    EXIT WHEN removed = 0;
    IF commit_batches THEN COMMIT; END IF;
  END LOOP;`;

/**
 * The retention procedure: drops partitions older than the retention window, trims the DEFAULT
 * partition, then creates partitions from the newest upper bound through two intervals ahead.
 * Rows that landed in DEFAULT for a new range are moved out first, because Postgres refuses a
 * partition whose range the DEFAULT partition already holds rows for. Then removes tombstones past the deleted-items
 * period and ends with the row sweeps. `commit_batches` is false only inside a transaction, where a COMMIT is refused.
 */
function generateRetentionProcedureSql(): string {
  return `CREATE OR REPLACE PROCEDURE public.${retentionProcedure}(commit_batches boolean DEFAULT true) LANGUAGE plpgsql AS $proc$
DECLARE
  cfg record;
  child record;
  removed bigint;
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

  -- Tombstones: a deleted product row goes for good after the deleted-items period, a batch at a time. The row
  -- holding its organization's newest sequence position stays: a counter rebuild takes MAX(seq) over the rows.
  ${tombstoneTables.map(generateTombstoneSql).join('\n  ')}

  -- Plain tables: retention by DELETE
  ${sweepRules.map(({ table, aged }) => `DELETE FROM ${table} WHERE ${aged};`).join('\n  ')}
END $proc$;`;
}

async function run(): Promise<SideEffectBlock> {
  const tableSetupSql = partitionConfigs.map(generateTablePartitionSql).join('\n');

  const migrationSql = `-- =============================================================================
-- Migration: Time-partitioned tables and in-database retention
-- =============================================================================
-- Converts the tables below to native range partitions and installs
-- apply_retention(), which pg_cron runs nightly (see
-- scripts/db/schedule-retention.ts) to create partitions ahead, drop those
-- past retention and sweep the plain tables. No extension is needed here.
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

-- The procedure's earlier name, and its signature without arguments; the schedule script moves the pg_cron job over.
DROP PROCEDURE IF EXISTS public.maintain_partitions();
DROP PROCEDURE IF EXISTS public.apply_retention();

${generateRetentionProcedureSql()}

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
  -- Inside the migration's transaction, where a COMMIT is refused.
  CALL public.${retentionProcedure}(false);
  RAISE NOTICE 'Retention setup complete.';
END $$;
`;

  return {
    tag: 'retention_setup',
    title: 'Partitioned tables and apply_retention()',
    sql: migrationSql,
    notes: [
      ...partitionConfigs.map((config) => `${config.name}: ${config.interval} partitions, ${config.retention ?? 'indefinite'} retention`),
      ...sweepRules.map(({ table, aged }) => `${table}: swept where ${aged.replace(/\s+/g, ' ')}`),
    ],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Retention',
  produce: run,
};
