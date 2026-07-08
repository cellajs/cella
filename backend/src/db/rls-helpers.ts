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

/**
 * Tenant-scoped SELECT policy for product entity tables.
 * Requires tenant match + authentication for reads.
 */
export const tenantSelectPolicy = (name: string, table: { tenantId: unknown }) =>
  pgPolicy(`${name}_select_policy`, { for: 'select', using: tenantReadCondition(table) });

/**
 * Unconditional write-through policies (INSERT, UPDATE, DELETE).
 * FORCE RLS requires explicit write policies; guards, FKs, and triggers enforce write isolation.
 */
export const writeThroughPolicies = (name: string) => [
  pgPolicy(`${name}_insert_policy`, { for: 'insert', withCheck: sql`true` }),
  pgPolicy(`${name}_update_policy`, { for: 'update', using: sql`true` }),
  pgPolicy(`${name}_delete_policy`, { for: 'delete', using: sql`true` }),
];
