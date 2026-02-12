-- RLS (Row-Level Security) Setup
-- Configures FORCE RLS, table ownership, and grants.
-- Policies are defined in Drizzle schema files using pgPolicy().
-- For PGlite: migration is skipped (no role support).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') THEN
    RAISE NOTICE 'Roles not available - skipping RLS setup (e.g., PGlite).';
    RETURN;
  END IF;

  -- Table ownership and FORCE RLS
  ALTER TABLE organizations OWNER TO admin_role;
  ALTER TABLE attachments OWNER TO admin_role;
  ALTER TABLE pages OWNER TO admin_role;
  ALTER TABLE memberships OWNER TO admin_role;
  ALTER TABLE inactive_memberships OWNER TO admin_role;
  ALTER TABLE activities OWNER TO admin_role;

  ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
  ALTER TABLE attachments FORCE ROW LEVEL SECURITY;
  ALTER TABLE pages FORCE ROW LEVEL SECURITY;
  ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
  ALTER TABLE inactive_memberships FORCE ROW LEVEL SECURITY;

  -- Grants: runtime_role (subject to RLS)
  GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON attachments TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON pages TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON inactive_memberships TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON users TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON last_seen TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON tokens TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON passkeys TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_accounts TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON passwords TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON totps TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON requests TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON unsubscribe_tokens TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON emails TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON counters TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON context_counters TO runtime_role;
  GRANT SELECT ON tenants TO runtime_role;
  GRANT SELECT ON system_roles TO runtime_role;
  GRANT SELECT ON activities TO runtime_role;

  -- Grants: cdc_role (append-only activities + counter sequences)
  GRANT INSERT ON activities TO cdc_role;
  GRANT SELECT, INSERT, UPDATE ON counters TO cdc_role;
  GRANT SELECT, INSERT, UPDATE ON context_counters TO cdc_role;
  GRANT SELECT ON tenants TO cdc_role;
  GRANT SELECT ON organizations TO cdc_role;

  -- Grants: admin_role (full access)
  GRANT ALL ON ALL TABLES IN SCHEMA public TO admin_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO admin_role;

  -- Grants: pg_catalog usage for JSONB operators
  GRANT USAGE ON SCHEMA pg_catalog TO runtime_role;

  RAISE NOTICE 'RLS setup complete.';
END $$;
