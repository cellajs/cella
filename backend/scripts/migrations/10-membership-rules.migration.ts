import { keepOrganizationAdminConstraint, keepOrganizationAdminSQL } from '#/db/membership-rules';
import type { SideEffectBlock, SideEffectProducer } from '../types';

/** Creates the membership rule triggers from `db/membership-rules.ts`, where the verify block reads what to assert. */
async function run(): Promise<SideEffectBlock> {
  const { adminRole, sql } = keepOrganizationAdminSQL();

  const migrationSql = `-- Membership rules
-- An organization keeps at least one '${adminRole}' membership.

${sql}`;

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
