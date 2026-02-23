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

  BEGIN
    -- Create publication for tracked tables (excludes 'activities' to prevent loops)
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'cdc_pub') THEN
      CREATE PUBLICATION cdc_pub FOR TABLE users, organizations, attachments, pages, requests, memberships, inactive_memberships;
      RAISE NOTICE 'Created publication cdc_pub';
    ELSE
      RAISE NOTICE 'Publication cdc_pub already exists';
    END IF;

    -- Set REPLICA IDENTITY FULL to get old row values on UPDATE/DELETE
    ALTER TABLE users REPLICA IDENTITY FULL;
    ALTER TABLE organizations REPLICA IDENTITY FULL;
    ALTER TABLE attachments REPLICA IDENTITY FULL;
    ALTER TABLE pages REPLICA IDENTITY FULL;
    ALTER TABLE requests REPLICA IDENTITY FULL;
    ALTER TABLE memberships REPLICA IDENTITY FULL;
    ALTER TABLE inactive_memberships REPLICA IDENTITY FULL;

    RAISE NOTICE 'CDC setup complete. Replication slot will be created by CDC worker on startup.';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CDC setup failed: %. Skipping - CDC will not be available.', SQLERRM;
  END;
END $$;
