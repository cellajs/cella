import { hierarchy } from 'shared';

/** The constraint a refused membership write names; `lib/error.ts` maps it to a 409 `last_admin`. */
export const keepOrganizationAdminConstraint = 'memberships_keep_org_admin';

/** The trigger that versions a user's bindings for the membership cache (`middlewares/guard/membership-cache.ts`). */
export const bumpBindingsVersionTrigger = 'memberships_bump_bindings_version';

/** The triggers the membership rules create, each with its function: the side-effect verify block asserts them. */
export const membershipRuleTriggers = [
  { tableName: 'memberships', triggerName: keepOrganizationAdminConstraint, functionName: keepOrganizationAdminConstraint },
  { tableName: 'memberships', triggerName: bumpBindingsVersionTrigger, functionName: bumpBindingsVersionTrigger },
];

/**
 * Every organization keeps at least one admin: the only role that can invite, change roles and manage settings. One
 * deferred constraint trigger enforces it for every path at once (demoting, removing, leaving, and deleting an account,
 * whose memberships go by cascade), checked at commit so a role swap inside one transaction passes. An organization
 * that is itself being deleted is exempt. The check holds a transaction lock per organization, so two transactions
 * that each remove one of the last two admins check one after the other: the second sees the first's commit, since a
 * PL/pgSQL statement under READ COMMITTED reads a fresh snapshot. Opposite lock orders across two organizations can
 * deadlock, which PostgreSQL ends by aborting one (409).
 * @returns The idempotent SQL, and the admin role it keeps: the organization's most privileged role in the hierarchy.
 * @throws When the organization declares no roles, so generating the migration fails.
 */
export const keepOrganizationAdminSQL = (): { adminRole: string; sql: string } => {
  const adminRole = hierarchy.getMostPrivilegedRole('organization');
  const name = keepOrganizationAdminConstraint;

  const sql = `CREATE OR REPLACE FUNCTION ${name}()
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
  PERFORM pg_advisory_xact_lock(hashtextextended('${name}:' || OLD.channel_id::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE channel_type = 'organization' AND organization_id = OLD.channel_id AND channel_id = OLD.channel_id
      AND role = '${adminRole}'
  ) THEN
    RAISE EXCEPTION 'Organization % would be left without an admin', OLD.channel_id
      USING ERRCODE = '23514', CONSTRAINT = '${name}';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS ${name} ON memberships;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER ${name}
  AFTER UPDATE OF role, channel_id OR DELETE ON memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ${name}();
`;

  return { adminRole, sql };
};

/**
 * Every insert, update and delete of a membership, by any writer and through cascades, gives its user's
 * `actors.bindings_version` a new random value in the same transaction. The guards read the version with each session or
 * token and cache memberships under it, so a change counts at the next request in every process. A random value never
 * repeats, also when a user id is reused or the database is restored.
 * @returns The idempotent SQL.
 */
export const bumpBindingsVersionSQL = (): string => {
  const name = bumpBindingsVersionTrigger;

  return `CREATE OR REPLACE FUNCTION ${name}()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE actors SET bindings_version = gen_random_uuid() WHERE id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS ${name} ON memberships;
--> statement-breakpoint

CREATE TRIGGER ${name}
  AFTER INSERT OR UPDATE OR DELETE ON memberships
  FOR EACH ROW EXECUTE FUNCTION ${name}();
`;
};
