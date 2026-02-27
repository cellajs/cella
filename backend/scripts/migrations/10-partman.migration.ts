/**
 * Generate pg_partman Migration Script
 *
 * This script generates SQL for setting up pg_partman automatic partitioning
 * and cleanup for token/session/activity tables.
 *
 * Tables affected:
 * - sessions: partitioned by expires_at (weekly, 30-day retention)
 * - tokens: partitioned by expires_at (weekly, 30-day retention)
 * - unsubscribe_tokens: partitioned by created_at (monthly, 90-day retention)
 * - activities: partitioned by created_at (weekly, 90-day retention)
 *
 * The activities table uses PostgreSQL's LIKE clause to clone whatever structure
 * Drizzle created, making it robust to schema changes and fork customizations.
 *
 * The generated migration is idempotent and gracefully skips if pg_partman
 * is not available (e.g., local PGlite development).
 */

import pc from 'picocolors';
import { logMigrationResult, upsertMigration } from './helpers/drizzle-utils';
import type { GenerateScript } from '../types';

// =============================================================================
// PARTITION CONFIGURATION
// =============================================================================

// Configuration for each partitioned table
interface PartitionConfig {
  name: string;
  /** Column to partition by */
  partitionColumn: string;
  /** Partition interval (e.g., '1 week', '1 month') */
  interval: string;
  /** Retention period (e.g., '30 days', '90 days'). Null = no retention (keep indefinitely). */
  retention: string | null;
  /**
   * SQL for table creation. If null, uses LIKE clause to clone existing table.
   * This is useful for tables with dynamic columns (like activities).
   */
  createTableSql: string | null;
  /** SQL for index creation. If empty and createTableSql is null, indexes are cloned. */
  indexesSql: string[];
}

// Define partition configurations - these must match the Drizzle schemas
// See: backend/src/db/schema/sessions.ts, tokens.ts, unsubscribe-tokens.ts, activities.ts
const partitionConfigs: PartitionConfig[] = [
  {
    name: 'sessions',
    partitionColumn: 'expires_at',
    interval: '1 week',
    retention: '30 days',
    createTableSql: `CREATE TABLE sessions (
    id varchar NOT NULL,
    token varchar NOT NULL,
    type varchar NOT NULL DEFAULT 'regular',
    user_id varchar NOT NULL,
    device_name varchar,
    device_type varchar NOT NULL DEFAULT 'desktop',
    device_os varchar,
    browser varchar,
    auth_strategy varchar NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT sessions_id_expires_at_pk PRIMARY KEY (id, expires_at),
    CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) PARTITION BY RANGE (expires_at)`,
    indexesSql: [
      'CREATE INDEX sessions_token_idx ON sessions (token)',
      'CREATE INDEX sessions_user_id_idx ON sessions (user_id)',
    ],
  },
  {
    name: 'tokens',
    partitionColumn: 'expires_at',
    interval: '1 week',
    retention: '30 days',
    createTableSql: `CREATE TABLE tokens (
    id varchar NOT NULL,
    token varchar NOT NULL,
    single_use_token varchar,
    type varchar NOT NULL,
    email varchar NOT NULL,
    user_id varchar,
    oauth_account_id varchar,
    inactive_membership_id varchar,
    created_by varchar,
    created_at timestamp DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    invoked_at timestamp with time zone,
    CONSTRAINT tokens_id_expires_at_pk PRIMARY KEY (id, expires_at),
    CONSTRAINT tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT tokens_oauth_account_id_oauth_accounts_id_fk FOREIGN KEY (oauth_account_id) REFERENCES oauth_accounts(id) ON DELETE CASCADE,
    CONSTRAINT tokens_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
  ) PARTITION BY RANGE (expires_at)`,
    indexesSql: [
      'CREATE INDEX tokens_token_type_idx ON tokens (token, type)',
      'CREATE INDEX tokens_user_id_idx ON tokens (user_id)',
    ],
  },
  {
    name: 'unsubscribe_tokens',
    partitionColumn: 'created_at',
    interval: '1 month',
    retention: '90 days',
    createTableSql: `CREATE TABLE unsubscribe_tokens (
    id varchar NOT NULL,
    user_id varchar NOT NULL,
    token varchar NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL,
    CONSTRAINT unsubscribe_tokens_id_created_at_pk PRIMARY KEY (id, created_at),
    CONSTRAINT unsubscribe_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) PARTITION BY RANGE (created_at)`,
    indexesSql: [
      'CREATE INDEX unsubscribe_tokens_token_idx ON unsubscribe_tokens (token)',
      'CREATE INDEX unsubscribe_tokens_user_id_idx ON unsubscribe_tokens (user_id)',
    ],
  },
  // Activities uses LIKE clause to clone Drizzle's schema (supports dynamic context columns)
  {
    name: 'activities',
    partitionColumn: 'created_at',
    interval: '1 week',
    retention: '90 days',
    createTableSql: null, // Use LIKE clause instead
    indexesSql: [], // Indexes are cloned from original table
  },
];

/**
 * Generate SQL for a single table partition setup using dynamic SQL.
 * Uses EXECUTE to avoid parser errors in environments that don't support PARTITION BY.
 *
 * For tables with createTableSql = null (like activities), uses PostgreSQL's LIKE clause
 * to clone the existing table structure. This makes it robust to dynamic columns.
 */
function generateTablePartitionSql(config: PartitionConfig): string {
  // Handle tables that use LIKE clause (dynamic schema)
  if (config.createTableSql === null) {
    return `  -- ==========================================================================
  -- ${config.name.toUpperCase()} TABLE: Convert to partitioned (using LIKE clause)
  -- ==========================================================================
  -- Uses LIKE to clone existing table structure, making it robust to schema changes
  
  -- 1. Create partitioned table cloning structure from Drizzle-created table
  -- Note: We create the partitioned version first, then swap
  EXECUTE 'CREATE TABLE ${config.name}_partitioned (LIKE ${config.name} INCLUDING DEFAULTS INCLUDING CONSTRAINTS) PARTITION BY RANGE (${config.partitionColumn})';
  
  -- 2. Clone indexes from original table
  FOR r IN 
    SELECT indexdef 
    FROM pg_indexes 
    WHERE tablename = '${config.name}' 
    AND indexname NOT LIKE '%_pkey'
  LOOP
    -- Replace table name in index definition
    EXECUTE replace(r.indexdef, ' ON ${config.name} ', ' ON ${config.name}_partitioned ');
  END LOOP;
  
  -- 3. Setup pg_partman (${config.interval} partitions, 4 weeks ahead)
  PERFORM partman.create_parent(
    p_parent_table => 'public.${config.name}_partitioned',
    p_control => '${config.partitionColumn}',
    p_interval => '${config.interval}'
  );
  
  -- 4. Configure retention${config.retention ? ` (${config.retention}, drop old partitions)` : ' (NONE — records kept indefinitely)'}
  UPDATE partman.part_config SET
    retention = ${config.retention ? `'${config.retention}'` : 'NULL'},
    retention_keep_table = ${config.retention ? 'false' : 'true'},
    infinite_time_partitions = true
  WHERE parent_table = 'public.${config.name}_partitioned';
  
  -- 5. Migrate existing data
  INSERT INTO ${config.name}_partitioned SELECT * FROM ${config.name};
  
  -- 6. Swap tables atomically
  ALTER TABLE ${config.name} RENAME TO ${config.name}_old;
  ALTER TABLE ${config.name}_partitioned RENAME TO ${config.name};
  
  -- 7. Update partman config to use new table name
  UPDATE partman.part_config SET parent_table = 'public.${config.name}' WHERE parent_table = 'public.${config.name}_partitioned';
  
  -- 8. Drop old table
  DROP TABLE ${config.name}_old;
  
  RAISE NOTICE '${config.name} table converted to partitioned (via LIKE clause)';
`;
  }

  // Standard path for tables with explicit createTableSql
  const escapedCreateTableSql = config.createTableSql.replace(/'/g, "''");
  const escapedIndexesSql = config.indexesSql.map((sql) => sql.replace(/'/g, "''"));

  return `  -- ==========================================================================
  -- ${config.name.toUpperCase()} TABLE: Convert to partitioned
  -- ==========================================================================
  
  -- 1. Rename existing table
  ALTER TABLE ${config.name} RENAME TO ${config.name}_old;
  
  -- 2. Create partitioned table with same structure (dynamic SQL to avoid parse errors)
  EXECUTE '${escapedCreateTableSql}';
  
  -- 3. Create indexes
${escapedIndexesSql.map((sql) => `  EXECUTE '${sql}';`).join('\n')}
  
  -- 4. Setup pg_partman (${config.interval} partitions, 4 weeks ahead)
  PERFORM partman.create_parent(
    p_parent_table => 'public.${config.name}',
    p_control => '${config.partitionColumn}',
    p_interval => '${config.interval}'
  );
  
  -- 5. Configure retention${config.retention ? ` (${config.retention}, drop old partitions)` : ' (NONE — records kept indefinitely)'}
  UPDATE partman.part_config SET
    retention = ${config.retention ? `'${config.retention}'` : 'NULL'},
    retention_keep_table = ${config.retention ? 'false' : 'true'},
    infinite_time_partitions = true
  WHERE parent_table = 'public.${config.name}';
  
  -- 6. Migrate existing data
  INSERT INTO ${config.name} SELECT * FROM ${config.name}_old;
  
  -- 7. Drop old table
  DROP TABLE ${config.name}_old;
  
  RAISE NOTICE '${config.name} table converted to partitioned';
`;
}

async function run() {
  // Generate the full migration SQL
  const tableSetupSql = partitionConfigs.map(generateTablePartitionSql).join('\n');

  const migrationSql = `-- =============================================================================
-- Migration: pg_partman Setup for Token/Session/Activity Tables
-- =============================================================================
-- This migration converts sessions, tokens, unsubscribe_tokens, and activities
-- to partitioned tables managed by pg_partman for automatic cleanup.
--
-- IMPORTANT: This creates a schema drift between Drizzle and the actual DB:
-- - Drizzle sees: regular tables with composite PKs
-- - PostgreSQL has: partitioned tables with composite PKs
--
-- This is intentional. Standard ALTER TABLE operations (ADD COLUMN, etc.)
-- work fine on partitioned tables. Only avoid operations that recreate tables.
--
-- Tables affected:
-- - sessions: partitioned by expires_at (weekly, 30-day retention)
-- - tokens: partitioned by expires_at (weekly, 30-day retention)
-- - unsubscribe_tokens: partitioned by created_at (monthly, 90-day retention)
-- - activities: partitioned by created_at (weekly, 90-day retention)
--
-- For environments without pg_partman (PGlite, etc.): migration is skipped,
-- manual cleanup via db-maintenance.ts handles expired records.
-- =============================================================================

-- First check: Skip entirely if extensions are not supported (e.g., PGlite)
DO $$
BEGIN
  -- This check uses pg_extension catalog which exists in PostgreSQL but behavior
  -- differs in PGlite. We use a simple extension check that will fail in PGlite.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'plpgsql') THEN
    RAISE NOTICE 'Extensions not available - skipping partman setup.';
    RETURN;
  END IF;
END $$;--> statement-breakpoint

-- Second phase: Check if pg_partman is available and run setup
DO $$
DECLARE
  partman_available BOOLEAN := false;
  r RECORD;
BEGIN
  -- Try to create pg_partman extension
  BEGIN
    CREATE SCHEMA IF NOT EXISTS partman;
    CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;
    partman_available := true;
    RAISE NOTICE 'pg_partman extension enabled';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_partman not available - skipping partition setup. Manual cleanup will be used.';
    RETURN;
  END;

  IF NOT partman_available THEN
    RETURN;
  END IF;

  -- Wrap all partition conversions in an exception handler so environments
  -- where pg_partman installs but partitioning operations fail (e.g., Neon)
  -- still complete the migration successfully.
  BEGIN

${tableSetupSql}
  -- ==========================================================================
  -- Schedule automatic maintenance
  -- ==========================================================================
  -- pg_partman run_maintenance() should be called periodically.
  -- Options:
  -- 1. pg_cron: schedule run_maintenance_proc() hourly
  -- 2. External scheduler (cron, Cloud Scheduler, etc.)
  -- 3. Neon: pg_partman maintenance runs automatically
  
  RAISE NOTICE 'pg_partman setup complete. Remember to schedule run_maintenance().';

  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Partition setup failed: %. Tables will use regular (non-partitioned) mode with manual cleanup.', SQLERRM;
  END;

END $$;
`;

  // Use shared migration utility
  const result = upsertMigration('partman_setup', migrationSql);
  logMigrationResult(result, 'pg_partman setup');

  console.info('');
  console.info(`  ${pc.bold(pc.greenBright('Configured tables:'))}`);
  for (const config of partitionConfigs) {
    const retentionLabel = config.retention ?? 'indefinite';
    console.info(`    - ${config.name}: ${config.interval} partitions, ${retentionLabel} retention`);
  }
  console.info('');
}

export const generateConfig: GenerateScript = {
  name: 'Partman setup migration',
  type: 'migration',
  run,
};
