-- =============================================================================
-- Migration: pg_partman Setup for Token/Session Tables
-- =============================================================================
-- This migration converts sessions, tokens, and unsubscribe_tokens to
-- partitioned tables managed by pg_partman for automatic cleanup.
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
--
-- For environments without pg_partman: migration is skipped, manual cleanup
-- via db-maintenance.ts handles expired records.
-- =============================================================================

-- Check if pg_partman is available and run setup
DO $$
DECLARE
  partman_available BOOLEAN := false;
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

  -- ==========================================================================
  -- SESSIONS TABLE: Convert to partitioned
  -- ==========================================================================
  
  -- 1. Rename existing table
  ALTER TABLE sessions RENAME TO sessions_old;
  
  -- 2. Create partitioned table with same structure
  CREATE TABLE sessions (
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
  ) PARTITION BY RANGE (expires_at);
  
  -- 3. Create indexes
  CREATE INDEX sessions_token_idx ON sessions (token);
  CREATE INDEX sessions_user_id_idx ON sessions (user_id);
  
  -- 4. Setup pg_partman (1 week partitions, 4 weeks ahead)
  PERFORM partman.create_parent(
    p_parent_table => 'public.sessions',
    p_control => 'expires_at',
    p_interval => '1 week'
  );
  
  -- 5. Configure retention (30 days, drop old partitions)
  UPDATE partman.part_config SET
    retention = '30 days',
    retention_keep_table = false,
    infinite_time_partitions = true
  WHERE parent_table = 'public.sessions';
  
  -- 6. Migrate existing data
  INSERT INTO sessions SELECT * FROM sessions_old;
  
  -- 7. Drop old table
  DROP TABLE sessions_old;
  
  RAISE NOTICE 'sessions table converted to partitioned';

  -- ==========================================================================
  -- TOKENS TABLE: Convert to partitioned
  -- ==========================================================================
  
  -- 1. Rename existing table
  ALTER TABLE tokens RENAME TO tokens_old;
  
  -- 2. Create partitioned table with same structure
  CREATE TABLE tokens (
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
  ) PARTITION BY RANGE (expires_at);
  
  -- 3. Create indexes
  CREATE INDEX tokens_token_type_idx ON tokens (token, type);
  CREATE INDEX tokens_user_id_idx ON tokens (user_id);
  
  -- 4. Setup pg_partman (1 week partitions, 4 weeks ahead)
  PERFORM partman.create_parent(
    p_parent_table => 'public.tokens',
    p_control => 'expires_at',
    p_interval => '1 week'
  );
  
  -- 5. Configure retention (30 days, drop old partitions)
  UPDATE partman.part_config SET
    retention = '30 days',
    retention_keep_table = false,
    infinite_time_partitions = true
  WHERE parent_table = 'public.tokens';
  
  -- 6. Migrate existing data
  INSERT INTO tokens SELECT * FROM tokens_old;
  
  -- 7. Drop old table
  DROP TABLE tokens_old;
  
  RAISE NOTICE 'tokens table converted to partitioned';

  -- ==========================================================================
  -- UNSUBSCRIBE_TOKENS TABLE: Convert to partitioned
  -- ==========================================================================
  
  -- 1. Rename existing table
  ALTER TABLE unsubscribe_tokens RENAME TO unsubscribe_tokens_old;
  
  -- 2. Create partitioned table with same structure
  CREATE TABLE unsubscribe_tokens (
    id varchar NOT NULL,
    user_id varchar NOT NULL,
    token varchar NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL,
    CONSTRAINT unsubscribe_tokens_id_created_at_pk PRIMARY KEY (id, created_at),
    CONSTRAINT unsubscribe_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) PARTITION BY RANGE (created_at);
  
  -- 3. Create indexes
  CREATE INDEX unsubscribe_tokens_token_idx ON unsubscribe_tokens (token);
  CREATE INDEX unsubscribe_tokens_user_id_idx ON unsubscribe_tokens (user_id);
  
  -- 4. Setup pg_partman (1 month partitions, 4 weeks ahead)
  PERFORM partman.create_parent(
    p_parent_table => 'public.unsubscribe_tokens',
    p_control => 'created_at',
    p_interval => '1 month'
  );
  
  -- 5. Configure retention (90 days, drop old partitions)
  UPDATE partman.part_config SET
    retention = '90 days',
    retention_keep_table = false,
    infinite_time_partitions = true
  WHERE parent_table = 'public.unsubscribe_tokens';
  
  -- 6. Migrate existing data
  INSERT INTO unsubscribe_tokens SELECT * FROM unsubscribe_tokens_old;
  
  -- 7. Drop old table
  DROP TABLE unsubscribe_tokens_old;
  
  RAISE NOTICE 'unsubscribe_tokens table converted to partitioned';

  -- ==========================================================================
  -- Schedule automatic maintenance
  -- ==========================================================================
  -- pg_partman's run_maintenance() should be called periodically.
  -- Options:
  -- 1. pg_cron: SELECT cron.schedule('partman-maintenance', '0 * * * *', $$CALL partman.run_maintenance_proc()$$);
  -- 2. External scheduler (cron, Cloud Scheduler, etc.)
  -- 3. Neon: pg_partman maintenance runs automatically
  
  RAISE NOTICE 'pg_partman setup complete. Remember to schedule run_maintenance().';

END $$;
