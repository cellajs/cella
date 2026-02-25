-- Immutability Triggers Setup
-- Prevents modification of identity columns after row creation.
-- For PGlite: migration is skipped (no role support).

-- Functions are always created (harmless without triggers)

CREATE OR REPLACE FUNCTION base_entity_immutable_keys() RETURNS TRIGGER AS $$
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

CREATE OR REPLACE FUNCTION product_entity_immutable_keys() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Cannot modify immutable columns (%) on %', 'id, tenant_id, entity_type, created_at, created_by, organization_id', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

CREATE OR REPLACE FUNCTION inactive_membership_immutable_keys() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Cannot modify immutable columns (%) on %', 'tenant_id, organization_id', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Triggers require roles to exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') THEN
    RAISE NOTICE 'Roles not available - skipping immutability triggers (e.g., PGlite).';
    RETURN;
  END IF;

  BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS organizations_immutable_keys_trigger ON organizations';
    EXECUTE 'CREATE TRIGGER organizations_immutable_keys_trigger BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION base_entity_immutable_keys()';
    EXECUTE 'DROP TRIGGER IF EXISTS pages_immutable_keys_trigger ON pages';
    EXECUTE 'CREATE TRIGGER pages_immutable_keys_trigger BEFORE UPDATE ON pages FOR EACH ROW EXECUTE FUNCTION base_entity_immutable_keys()';
    EXECUTE 'DROP TRIGGER IF EXISTS attachments_immutable_keys_trigger ON attachments';
    EXECUTE 'CREATE TRIGGER attachments_immutable_keys_trigger BEFORE UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION product_entity_immutable_keys()';
    EXECUTE 'DROP TRIGGER IF EXISTS memberships_immutable_keys_trigger ON memberships';
    EXECUTE 'CREATE TRIGGER memberships_immutable_keys_trigger BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION membership_immutable_keys()';
    EXECUTE 'DROP TRIGGER IF EXISTS inactive_memberships_immutable_keys_trigger ON inactive_memberships';
    EXECUTE 'CREATE TRIGGER inactive_memberships_immutable_keys_trigger BEFORE UPDATE ON inactive_memberships FOR EACH ROW EXECUTE FUNCTION inactive_membership_immutable_keys()';
    EXECUTE 'DROP TRIGGER IF EXISTS activities_immutable_keys_trigger ON activities';
    EXECUTE 'CREATE TRIGGER activities_immutable_keys_trigger BEFORE UPDATE ON activities FOR EACH ROW EXECUTE FUNCTION append_only_immutable_row()';

    RAISE NOTICE 'Immutability triggers setup complete.';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Immutability triggers setup failed: %. Skipping.', SQLERRM;
  END;
END $$;
