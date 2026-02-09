-- RLS (Row-Level Security) Setup
-- Configures FORCE RLS, table ownership, grants, and policies.
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
  GRANT SELECT ON activities TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON users TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON tokens TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON passkeys TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_accounts TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON requests TO runtime_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON unsubscribe_tokens TO runtime_role;
  GRANT SELECT ON tenants TO runtime_role;

  -- Grants: cdc_role (append-only activities)
  GRANT INSERT ON activities TO cdc_role;
  GRANT SELECT ON tenants TO cdc_role;
  GRANT SELECT ON organizations TO cdc_role;

  -- Grants: admin_role (full access)
  GRANT ALL ON ALL TABLES IN SCHEMA public TO admin_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO admin_role;

  -- RLS Policies

  -- organizations: Standard RLS (tenant + org)
  DROP POLICY IF EXISTS organizations_select ON organizations;
  CREATE POLICY organizations_select ON organizations FOR SELECT USING (
    tenant_id = current_setting('app.tenant_id', true)
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = organizations.id
        AND m.user_id = current_setting('app.user_id', true)::uuid
    )
  );

  DROP POLICY IF EXISTS organizations_insert ON organizations;
  CREATE POLICY organizations_insert ON organizations FOR INSERT WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = organizations.id
        AND m.user_id = current_setting('app.user_id', true)::uuid
    )
  );

  DROP POLICY IF EXISTS organizations_update ON organizations;
  CREATE POLICY organizations_update ON organizations FOR UPDATE USING (
    tenant_id = current_setting('app.tenant_id', true)
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = organizations.id
        AND m.user_id = current_setting('app.user_id', true)::uuid
    )
  );

  DROP POLICY IF EXISTS organizations_delete ON organizations;
  CREATE POLICY organizations_delete ON organizations FOR DELETE USING (
    tenant_id = current_setting('app.tenant_id', true)
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = organizations.id
        AND m.user_id = current_setting('app.user_id', true)::uuid
    )
  );

  -- attachments: Standard RLS (tenant + org)
  DROP POLICY IF EXISTS attachments_select ON attachments;
  CREATE POLICY attachments_select ON attachments FOR SELECT USING (
    tenant_id = current_setting('app.tenant_id', true)
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = attachments.organization_id
        AND m.user_id = current_setting('app.user_id', true)::uuid
    )
  );

  DROP POLICY IF EXISTS attachments_insert ON attachments;
  CREATE POLICY attachments_insert ON attachments FOR INSERT WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = attachments.organization_id
        AND m.user_id = current_setting('app.user_id', true)::uuid
    )
  );

  DROP POLICY IF EXISTS attachments_update ON attachments;
  CREATE POLICY attachments_update ON attachments FOR UPDATE USING (
    tenant_id = current_setting('app.tenant_id', true)
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = attachments.organization_id
        AND m.user_id = current_setting('app.user_id', true)::uuid
    )
  );

  DROP POLICY IF EXISTS attachments_delete ON attachments;
  CREATE POLICY attachments_delete ON attachments FOR DELETE USING (
    tenant_id = current_setting('app.tenant_id', true)
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = attachments.organization_id
        AND m.user_id = current_setting('app.user_id', true)::uuid
    )
  );

  -- pages: Hybrid RLS (public_access OR tenant + org)
  DROP POLICY IF EXISTS pages_select ON pages;
  CREATE POLICY pages_select ON pages FOR SELECT USING (
    public_access = true
    OR (
      tenant_id = current_setting('app.tenant_id', true)
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = pages.organization_id
        AND m.user_id = current_setting('app.user_id', true)::uuid
    )
    )
  );

  DROP POLICY IF EXISTS pages_insert ON pages;
  CREATE POLICY pages_insert ON pages FOR INSERT WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = pages.organization_id
        AND m.user_id = current_setting('app.user_id', true)::uuid
    )
  );

  DROP POLICY IF EXISTS pages_update ON pages;
  CREATE POLICY pages_update ON pages FOR UPDATE USING (
    tenant_id = current_setting('app.tenant_id', true)
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = pages.organization_id
        AND m.user_id = current_setting('app.user_id', true)::uuid
    )
  );

  DROP POLICY IF EXISTS pages_delete ON pages;
  CREATE POLICY pages_delete ON pages FOR DELETE USING (
    tenant_id = current_setting('app.tenant_id', true)
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = pages.organization_id
        AND m.user_id = current_setting('app.user_id', true)::uuid
    )
  );

  -- memberships: Cross-tenant read (user_id), tenant-only writes
  DROP POLICY IF EXISTS memberships_select ON memberships;
  CREATE POLICY memberships_select ON memberships FOR SELECT USING (
    user_id = current_setting('app.user_id', true)::uuid
  );

  DROP POLICY IF EXISTS memberships_insert ON memberships;
  CREATE POLICY memberships_insert ON memberships FOR INSERT WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)
  );

  DROP POLICY IF EXISTS memberships_update ON memberships;
  CREATE POLICY memberships_update ON memberships FOR UPDATE USING (
    tenant_id = current_setting('app.tenant_id', true)
  );

  DROP POLICY IF EXISTS memberships_delete ON memberships;
  CREATE POLICY memberships_delete ON memberships FOR DELETE USING (
    tenant_id = current_setting('app.tenant_id', true)
  );

  -- inactive_memberships: Cross-tenant read (user_id), tenant-only writes
  DROP POLICY IF EXISTS inactive_memberships_select ON inactive_memberships;
  CREATE POLICY inactive_memberships_select ON inactive_memberships FOR SELECT USING (
    user_id = current_setting('app.user_id', true)::uuid
  );

  DROP POLICY IF EXISTS inactive_memberships_insert ON inactive_memberships;
  CREATE POLICY inactive_memberships_insert ON inactive_memberships FOR INSERT WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)
  );

  DROP POLICY IF EXISTS inactive_memberships_update ON inactive_memberships;
  CREATE POLICY inactive_memberships_update ON inactive_memberships FOR UPDATE USING (
    tenant_id = current_setting('app.tenant_id', true)
  );

  DROP POLICY IF EXISTS inactive_memberships_delete ON inactive_memberships;
  CREATE POLICY inactive_memberships_delete ON inactive_memberships FOR DELETE USING (
    tenant_id = current_setting('app.tenant_id', true)
  );

  RAISE NOTICE 'RLS setup complete.';
END $$;
