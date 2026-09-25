import { hierarchy } from 'shared';
import type { SideEffectBlock, SideEffectProducer } from '../types';

/** The constraint name the app maps to a 409 `last_admin`; see `backend/src/lib/error.ts`. */
export const keepOrganizationAdminConstraint = 'memberships_keep_org_admin';

/**
 * Every organization keeps at least one admin: the only role that can invite, change roles and manage settings. One
 * deferred constraint trigger enforces it for every path at once (demoting, removing, leaving, and deleting an account,
 * whose memberships go by cascade), checked at commit so a role swap inside one transaction passes. An organization
 * that is itself being deleted is exempt.
 */
async function run(): Promise<SideEffectBlock> {
  // The organization's most privileged role, from the app's own role vocabulary.
  const [adminRole] = hierarchy.getRoles('organization');

  const migrationSql = `-- Membership rules
-- An organization keeps at least one '${adminRole}' membership.

CREATE OR REPLACE FUNCTION ${keepOrganizationAdminConstraint}()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.channel_type <> 'organization' OR OLD.role <> '${adminRole}' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.role = '${adminRole}' AND NEW.channel_id = OLD.channel_id THEN
    RETURN NULL;
  END IF;
  -- The organization is gone with its memberships: there is nothing left to manage.
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = OLD.channel_id) THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE channel_type = 'organization' AND channel_id = OLD.channel_id AND role = '${adminRole}'
  ) THEN
    RAISE EXCEPTION 'Organization % would be left without an admin', OLD.channel_id
      USING ERRCODE = '23514', CONSTRAINT = '${keepOrganizationAdminConstraint}';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS ${keepOrganizationAdminConstraint} ON memberships;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER ${keepOrganizationAdminConstraint}
  AFTER UPDATE OF role, channel_id OR DELETE ON memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ${keepOrganizationAdminConstraint}();
`;

  return {
    tag: 'membership_rules',
    title: 'Membership rules, an organization keeps an admin',
    sql: migrationSql,
    notes: [`Trigger: ${keepOrganizationAdminConstraint} (admin role '${adminRole}')`],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Membership rules',
  produce: run,
};
