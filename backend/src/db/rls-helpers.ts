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
 * derive from this object, so a policy that drifts from it fails the migration.
 */
export const rlsPolicyContract = (name: string) =>
  ({
    select: { name: `${name}_select_policy`, command: 'r', expression: 'tenant' },
    insert: { name: `${name}_insert_policy`, command: 'a', expression: 'true' },
    update: { name: `${name}_update_policy`, command: 'w', expression: 'true' },
    delete: { name: `${name}_delete_policy`, command: 'd', expression: 'true' },
  }) satisfies Record<string, RlsPolicyContract>;

export const tenantSelectPolicy = (name: string, table: { tenantId: unknown }) =>
  pgPolicy(rlsPolicyContract(name).select.name, { for: 'select', using: tenantReadCondition(table) });

/** Enabled RLS denies runtime_role writes without explicit write policies; guards, FKs, and triggers enforce write isolation. */
export const writeThroughPolicies = (name: string) => {
  const { insert, update, delete: del } = rlsPolicyContract(name);
  return [
    pgPolicy(insert.name, { for: 'insert', withCheck: sql`true` }),
    pgPolicy(update.name, { for: 'update', using: sql`true` }),
    pgPolicy(del.name, { for: 'delete', using: sql`true` }),
  ];
};
