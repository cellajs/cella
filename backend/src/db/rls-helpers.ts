import { sql } from 'drizzle-orm';
import { pgPolicy } from 'drizzle-orm/pg-core';

/** Fail-closed check: tenant context is set. */
export const tenantContextSet = sql`COALESCE(current_setting('app.tenant_id', true), '') != ''`;

/** Row's tenant_id matches session context (fail-closed). */
export const tenantMatch = (t: { tenantId: unknown }) => sql`
  ${tenantContextSet}
  AND ${t.tenantId} = current_setting('app.tenant_id', true)::text
`;

/** Tenant-scoped read: matching tenant (fail-closed). */
export const tenantReadCondition = (t: { tenantId: unknown; deletedAt?: unknown }) => {
  const includeDeleted = sql`current_setting('app.include_deleted', true) = 'true'`;
  const liveRow = t.deletedAt ? sql`AND (${t.deletedAt} IS NULL OR ${includeDeleted})` : sql``;

  return sql`
    ${tenantMatch(t)}
    ${liveRow}
  `;
};

export interface RlsPolicyContract {
  name: string;
  /** `pg_policy.polcmd`: r = select, a = insert, w = update, d = delete. */
  command: 'r' | 'a' | 'w' | 'd';
  /** `tenant`: the fail-closed tenant match; `true`: write-through. */
  expression: 'tenant' | 'true';
}

/**
 * The four policies every RLS table carries. The schema (`pgPolicy`) and the verify migration
 * derive from this list, so a policy that drifts from it fails the migration.
 */
export const rlsPolicyContract = (name: string): RlsPolicyContract[] => [
  { name: `${name}_select_policy`, command: 'r', expression: 'tenant' },
  { name: `${name}_insert_policy`, command: 'a', expression: 'true' },
  { name: `${name}_update_policy`, command: 'w', expression: 'true' },
  { name: `${name}_delete_policy`, command: 'd', expression: 'true' },
];

const policyName = (name: string, command: RlsPolicyContract['command']): string => {
  const entry = rlsPolicyContract(name).find((policy) => policy.command === command);
  if (!entry) throw new Error(`rlsPolicyContract: no ${command} policy for ${name}`);
  return entry.name;
};

export const tenantSelectPolicy = (name: string, table: { tenantId: unknown }) =>
  pgPolicy(policyName(name, 'r'), { for: 'select', using: tenantReadCondition(table) });

/** FORCE RLS requires explicit write policies; guards, FKs, and triggers enforce write isolation. */
export const writeThroughPolicies = (name: string) => [
  pgPolicy(policyName(name, 'a'), { for: 'insert', withCheck: sql`true` }),
  pgPolicy(policyName(name, 'w'), { for: 'update', using: sql`true` }),
  pgPolicy(policyName(name, 'd'), { for: 'delete', using: sql`true` }),
];
