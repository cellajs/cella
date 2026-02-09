-- Immutability Triggers Setup
-- Prevents modification of identity columns after row creation.
-- For PGlite: migration is skipped (no role support).
--

DO $$
BEGIN
  -- Check if roles exist (not available in PGlite)
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') THEN
    RAISE NOTICE 'Roles not available - skipping immutability triggers (e.g., PGlite).';
    RETURN;
  END IF;

  RAISE NOTICE 'Roles available - immutability triggers will be applied.';
END $$;

-- Only execute trigger creation if roles exist (real PostgreSQL)
-- The DO block above just logs; actual SQL runs unconditionally but triggers
-- are harmless in PGlite (they just exist without RLS context)


-- ==========================================================================
-- Immutability Trigger Functions
-- ==========================================================================

-- Context entities (organization)

CREATE OR REPLACE FUNCTION context_entity_immutable_keys() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Cannot modify immutable columns (%) on %', 'id, tenant_id, entity_type, created_at, created_by', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Product entities (attachment, page)

CREATE OR REPLACE FUNCTION product_entity_immutable_keys() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Cannot modify immutable columns (%) on %', 'id, tenant_id, organization_id, entity_type, created_at, created_by', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Memberships

CREATE OR REPLACE FUNCTION membership_immutable_keys() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot modify immutable columns (%) on %', 'tenant_id, organization_id, user_id', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Inactive memberships

CREATE OR REPLACE FUNCTION inactive_membership_immutable_keys() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Cannot modify immutable columns (%) on %', 'tenant_id, organization_id', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================================================
-- Apply Triggers to Tables
-- ==========================================================================

-- Context entity tables

DROP TRIGGER IF EXISTS organizations_immutable_keys_trigger ON organizations;
CREATE TRIGGER organizations_immutable_keys_trigger
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION context_entity_immutable_keys();

-- Product entity tables

DROP TRIGGER IF EXISTS attachments_immutable_keys_trigger ON attachments;
CREATE TRIGGER attachments_immutable_keys_trigger
  BEFORE UPDATE ON attachments
  FOR EACH ROW EXECUTE FUNCTION product_entity_immutable_keys();

DROP TRIGGER IF EXISTS pages_immutable_keys_trigger ON pages;
CREATE TRIGGER pages_immutable_keys_trigger
  BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION product_entity_immutable_keys();

-- Membership tables

DROP TRIGGER IF EXISTS memberships_immutable_keys_trigger ON memberships;
CREATE TRIGGER memberships_immutable_keys_trigger
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION membership_immutable_keys();

DROP TRIGGER IF EXISTS inactive_memberships_immutable_keys_trigger ON inactive_memberships;
CREATE TRIGGER inactive_memberships_immutable_keys_trigger
  BEFORE UPDATE ON inactive_memberships
  FOR EACH ROW EXECUTE FUNCTION inactive_membership_immutable_keys();

