import { sql } from 'drizzle-orm';
import { pgPolicy } from 'drizzle-orm/pg-core';

/** A session variable as a scalar subquery, which Postgres reads once per statement (an InitPlan), not once per row. */
const setting = (name: 'app.tenant_id' | 'app.include_deleted') => sql.raw(`(SELECT current_setting('${name}', true))`);

/** Fail-closed check: tenant context is set. */
const tenantContextSet = sql`COALESCE(${setting('app.tenant_id')}, '') != ''`;

/** Row's tenant_id matches session context (fail-closed). */
const tenantMatch = (t: { tenantId: unknown }) => sql`
  ${tenantContextSet}
  AND ${t.tenantId} = ${setting('app.tenant_id')}
`;

/** A row of the transaction's tenant, a soft-deleted one only with `app.include_deleted`. */
const tenantRowCondition = (t: { tenantId: unknown; deletedAt?: unknown }) => {
  const includeDeleted = sql`${setting('app.include_deleted')} = 'true'`;
  const liveRow = t.deletedAt ? sql`AND (${t.deletedAt} IS NULL OR ${includeDeleted})` : sql``;

  return sql`
    ${tenantMatch(t)}
    ${liveRow}
  `;
};

/** The name of the one policy an RLS table carries. The verify migration asserts the catalog against it. */
export const tenantPolicyName = (tableName: string) => `${tableName}_tenant_policy`;

/**
 * The one policy every RLS table carries, for every command: a statement by `runtime_role` reads and writes rows of
 * the transaction's tenant alone, and none without one. A written row is checked against the same expression: a
 * soft delete runs with `app.include_deleted`.
 */
export const tenantPolicy = (tableName: string, table: { tenantId: unknown; deletedAt?: unknown }) =>
  pgPolicy(tenantPolicyName(tableName), { for: 'all', using: tenantRowCondition(table) });
