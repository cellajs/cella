-- Immutability Triggers Setup
-- Prevents modification of identity columns after row creation.
-- For PGlite: migration is skipped (no role support).
--

-- ==========================================================================
-- Immutability Trigger Functions and Triggers
-- All wrapped in a single DO block with exception handling
-- ==========================================================================

DO $$
BEGIN
  -- Check if roles exist (not available in PGlite)
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'runtime_role') THEN
    RAISE NOTICE 'Roles not available - skipping immutability triggers (e.g., PGlite).';
    RETURN;
  END IF;

  BEGIN
    -- Base entities: context + parentless products (organizations, pages)
    CREATE OR REPLACE FUNCTION base_entity_immutable_keys() RETURNS TRIGGER AS $fn$
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
    $fn$ LANGUAGE plpgsql;

    -- Product entities with parent (attachments)
    CREATE OR REPLACE FUNCTION product_entity_immutable_keys() RETURNS TRIGGER AS $fn$
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
    $fn$ LANGUAGE plpgsql;

    -- Memberships
    CREATE OR REPLACE FUNCTION membership_immutable_keys() RETURNS TRIGGER AS $fn$
    BEGIN
      IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
           OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Cannot modify immutable columns (%) on %', 'tenant_id, organization_id, user_id', TG_TABLE_NAME;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    -- Inactive memberships
    CREATE OR REPLACE FUNCTION inactive_membership_immutable_keys() RETURNS TRIGGER AS $fn$
    BEGIN
      IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'Cannot modify immutable columns (%) on %', 'tenant_id, organization_id', TG_TABLE_NAME;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;

    -- Apply triggers
    DROP TRIGGER IF EXISTS organizations_immutable_keys_trigger ON organizations;
    CREATE TRIGGER organizations_immutable_keys_trigger
      BEFORE UPDATE ON organizations
      FOR EACH ROW EXECUTE FUNCTION base_entity_immutable_keys();

    DROP TRIGGER IF EXISTS pages_immutable_keys_trigger ON pages;
    CREATE TRIGGER pages_immutable_keys_trigger
      BEFORE UPDATE ON pages
      FOR EACH ROW EXECUTE FUNCTION base_entity_immutable_keys();

    DROP TRIGGER IF EXISTS attachments_immutable_keys_trigger ON attachments;
    CREATE TRIGGER attachments_immutable_keys_trigger
      BEFORE UPDATE ON attachments
      FOR EACH ROW EXECUTE FUNCTION product_entity_immutable_keys();

    DROP TRIGGER IF EXISTS memberships_immutable_keys_trigger ON memberships;
    CREATE TRIGGER memberships_immutable_keys_trigger
      BEFORE UPDATE ON memberships
      FOR EACH ROW EXECUTE FUNCTION membership_immutable_keys();

    DROP TRIGGER IF EXISTS inactive_memberships_immutable_keys_trigger ON inactive_memberships;
    CREATE TRIGGER inactive_memberships_immutable_keys_trigger
      BEFORE UPDATE ON inactive_memberships
      FOR EACH ROW EXECUTE FUNCTION inactive_membership_immutable_keys();

    RAISE NOTICE 'Immutability triggers setup complete.';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Immutability triggers setup failed: %. Skipping.', SQLERRM;
  END;
END $$;

