/**
 * RLS (Row-Level Security) policy building blocks.
 *
 * Reusable SQL fragments for RLS policy definitions on product entity tables.
 * Follows the fail-closed principle: missing context always results in denied access for reads.
 *
 * Policy categories:
 *   Tenant-scoped SELECT — tenant match + authenticated read (tenantSelectPolicy)
 *   Write-through — unconditional allow for INSERT/UPDATE/DELETE (writeThroughPolicies)
 *
 * FORCE RLS requires explicit policies for every operation type — without a write policy,
 * PostgreSQL denies all writes by default. writeThroughPolicies provides the required
 * permissive policies while actual write isolation is enforced by:
 *   1. Guard chain (tenantGuard → orgGuard) at the application layer
 *   2. Composite foreign keys (tenant_id, organization_id) at the DB layer
 *   3. Immutability triggers preventing tenant_id/organization_id changes after creation
 *
 * Pages have no RLS — they are parentless, always public. Creates and updates are protected by sysAdminGuard.
 * Context entities and memberships have no RLS policies — access is enforced by guards.
 *
 * Session variables: app.tenant_id
 * @see info/ARCHITECTURE.md for full architecture documentation
 */

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
export const tenantReadCondition = (t: { tenantId: unknown }) => sql`
  ${tenantMatch(t)}
`;

/**
 * Tenant-scoped SELECT policy for product entity tables.
 * Requires tenant match + authentication for reads.
 * Write operations use permissive write-through — composite FKs + immutability triggers + guards cover writes.
 */
export const tenantSelectPolicy = (name: string, table: { tenantId: unknown }) =>
  pgPolicy(`${name}_select_policy`, { for: 'select', using: tenantReadCondition(table) });

/**
 * Unconditional write-through policies (INSERT, UPDATE, DELETE).
 * PostgreSQL denies writes by default when FORCE RLS is enabled and no write policy exists.
 * These permissive policies unblock writes — actual write isolation is enforced by:
 *   1. Guard chain (tenantGuard → orgGuard) at the application layer
 *   2. Composite foreign keys (tenant_id, organization_id) at the DB layer
 *   3. Immutability triggers preventing tenant_id/organization_id changes after creation
 */
export const writeThroughPolicies = (name: string) => [
  pgPolicy(`${name}_insert_policy`, { for: 'insert', withCheck: sql`true` }),
  pgPolicy(`${name}_update_policy`, { for: 'update', using: sql`true` }),
  pgPolicy(`${name}_delete_policy`, { for: 'delete', using: sql`true` }),
];
