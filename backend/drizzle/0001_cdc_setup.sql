-- CDC (Change Data Capture) Setup
-- Sets up PostgreSQL logical replication for the activities CDC worker.
-- Requires: wal_level=logical (see compose.yaml)

-- Create publication for tracked tables (excludes 'activities' to prevent loops)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'cella_development_cdc_pub') THEN
    CREATE PUBLICATION cella_development_cdc_pub FOR TABLE users, organizations, attachments, pages, requests, memberships;
    RAISE NOTICE 'Created publication cella_development_cdc_pub';
  ELSE
    RAISE NOTICE 'Publication cella_development_cdc_pub already exists';
  END IF;
END $$;

-- Set REPLICA IDENTITY FULL to get old row values on UPDATE/DELETE
ALTER TABLE users REPLICA IDENTITY FULL;
ALTER TABLE organizations REPLICA IDENTITY FULL;
ALTER TABLE attachments REPLICA IDENTITY FULL;
ALTER TABLE pages REPLICA IDENTITY FULL;
ALTER TABLE requests REPLICA IDENTITY FULL;
ALTER TABLE memberships REPLICA IDENTITY FULL;

-- Note: Replication slot 'cella_development_cdc_slot' is created by the CDC worker on startup
