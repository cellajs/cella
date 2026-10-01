import { bumpBindingsVersionSQL, bumpBindingsVersionTrigger, keepOrganizationAdminConstraint, keepOrganizationAdminSQL } from '#/db/membership-rules';
import type { SideEffectBlock, SideEffectProducer } from '../types';

/** Creates the membership rule triggers from `db/membership-rules.ts`, where the verify block reads what to assert. */
async function run(): Promise<SideEffectBlock> {
  const { adminRole, sql } = keepOrganizationAdminSQL();

  const migrationSql = `-- Membership rules
-- An organization keeps at least one '${adminRole}' membership.

${sql}
--> statement-breakpoint

-- Every membership write gives its user's actors.bindings_version a new value (the membership cache key).

${bumpBindingsVersionSQL()}`;

  return {
    tag: 'membership_rules',
    title: 'Membership rules, an organization keeps an admin, bindings versions',
    sql: migrationSql,
    notes: [`Trigger: ${keepOrganizationAdminConstraint} (admin role '${adminRole}')`, `Trigger: ${bumpBindingsVersionTrigger}`],
  };
}

export const sideEffect: SideEffectProducer = {
  name: 'Membership rules',
  produce: run,
};
