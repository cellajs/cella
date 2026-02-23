-- CDC (Change Data Capture) Setup
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
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'cdc_pub') THEN
      CREATE PUBLICATION cdc_pub FOR TABLE users, organizations, attachments, pages, requests, memberships, inactive_memberships;
      RAISE NOTICE 'Created publication cdc_pub';
    ELSE
      RAISE NOTICE 'Publication cdc_pub already exists';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Publication setup failed: %. Continuing...', SQLERRM;
  END;

  -- 2. Set REPLICA IDENTITY FULL (separate block)
  BEGIN
    ALTER TABLE users REPLICA IDENTITY FULL;
    ALTER TABLE organizations REPLICA IDENTITY FULL;
    ALTER TABLE attachments REPLICA IDENTITY FULL;
    ALTER TABLE pages REPLICA IDENTITY FULL;
    ALTER TABLE requests REPLICA IDENTITY FULL;
    ALTER TABLE memberships REPLICA IDENTITY FULL;
    ALTER TABLE inactive_memberships REPLICA IDENTITY FULL;
    RAISE NOTICE 'REPLICA IDENTITY FULL set on all tracked tables';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'REPLICA IDENTITY setup failed: %. Continuing...', SQLERRM;
  END;

  -- 3. Create replication slot (separate block - may fail on managed providers)
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE slot_name = 'cdc_slot') THEN
      PERFORM pg_create_logical_replication_slot('cdc_slot', 'pgoutput');
      RAISE NOTICE 'Created replication slot cdc_slot';
    ELSE
      RAISE NOTICE 'Replication slot cdc_slot already exists';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Replication slot setup failed: %. Worker will create it at startup.', SQLERRM;
  END;

  RAISE NOTICE 'CDC setup complete.';
END $$;
