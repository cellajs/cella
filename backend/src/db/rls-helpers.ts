/**
 * RLS (Row-Level Security) policy building blocks.
 *
 * Reusable SQL fragments for consistent RLS policy definitions across all tenant-scoped tables.
 * Follows the fail-closed principle: missing context always results in denied access.
 *
 * Policy categories:
 *   Standard       — tenant + org check on all ops (orgScopedCrudPolicies)
 *   Hybrid         — public SELECT OR tenant+org; writes require tenant+org (publicAccessCrudPolicies)
 *   Cross-tenant   — user sees own rows across tenants; writes scoped to tenant (memberships)
 *   Privilege-based — role grants control access; append-only for activities
 *
 * Session variables: app.tenant_id, app.user_id, app.is_authenticated
 * @see info/ARCHITECTURE.md for full architecture documentation
 */

import { sql } from 'drizzle-orm';
import { pgPolicy } from 'drizzle-orm/pg-core';

/** Fail-closed check: tenant context is set. */
export const tenantContextSet = sql`COALESCE(current_setting('app.tenant_id', true), '') != ''`;

/** Fail-closed check: user context is set. */
export const userContextSet = sql`COALESCE(current_setting('app.user_id', true), '') != ''`;

/** Check if current session is authenticated. */
export const isAuthenticated = sql`current_setting('app.is_authenticated', true)::boolean = true`;

/** Row's tenant_id matches session context (fail-closed). */
export const tenantMatch = (t: { tenantId: unknown }) => sql`
  ${tenantContextSet}
  AND ${t.tenantId} = current_setting('app.tenant_id', true)::text
`;

/** Row's user_id matches session context (fail-closed). */
export const userMatch = (t: { userId: unknown }) => sql`
  ${userContextSet}
  AND ${t.userId} = current_setting('app.user_id', true)::text
`;

/** Verify current user has membership in the row's organization (fail-closed). */
export const membershipExists = (t: { organizationId: unknown; tenantId: unknown }) => sql`
  ${userContextSet}
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = ${t.organizationId}
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = ${t.tenantId}
  )
`;

/** Tenant-scoped write: authenticated + matching tenant. */
export const tenantWriteCondition = (t: { tenantId: unknown }) => sql`
  ${tenantMatch(t)}
  AND ${isAuthenticated}
`;

/** Membership-verified write: authenticated + matching tenant + org membership. */
export const membershipWriteCondition = (t: { tenantId: unknown; organizationId: unknown }) => sql`
  ${tenantMatch(t)}
  AND ${isAuthenticated}
  AND ${membershipExists(t)}
`;

/** Cross-tenant SELECT: user can read own rows across tenants OR within current tenant with membership. */
export const crossTenantUserSelectCondition = (t: {
  tenantId: unknown;
  userId: unknown;
  organizationId: unknown;
}) => sql`
  ${isAuthenticated}
  AND (
    ${userMatch(t)}
    OR (${tenantMatch(t)} AND ${membershipExists(t)})
  )
`;

/** Row is publicly accessible OR user is authenticated. */
export const publicOrAuthenticated = (t: { publicAccess: unknown }) => sql`
  ${isAuthenticated} OR ${t.publicAccess} = true
`;

/** Public access SELECT: matching tenant + (authenticated OR public). */
export const publicAccessSelectCondition = (t: { tenantId: unknown; publicAccess: unknown }) => sql`
  ${tenantMatch(t)}
  AND ${publicOrAuthenticated(t)}
`;

/** Org-scoped CRUD policies for product entities scoped to an organization (e.g., attachments, tasks). Requires org membership for all operations. */
export const orgScopedCrudPolicies = (name: string, table: { tenantId: unknown; organizationId: unknown }) => {
  const condition = membershipWriteCondition(table);
  return [
    pgPolicy(`${name}_select_policy`, { for: 'select', using: condition }),
    pgPolicy(`${name}_insert_policy`, { for: 'insert', withCheck: condition }),
    pgPolicy(`${name}_update_policy`, { for: 'update', using: condition, withCheck: condition }),
    pgPolicy(`${name}_delete_policy`, { for: 'delete', using: condition }),
  ] as const;
};

/**
 * Org-scoped CRUD policies with public access support (e.g., attachments with shareable links).
 * SELECT: org membership OR (tenant match + publicAccess=true).
 * INSERT/UPDATE/DELETE: org membership required.
 */
export const orgScopedPublicAccessCrudPolicies = (
  name: string,
  table: { tenantId: unknown; organizationId: unknown; publicAccess: unknown },
) => {
  const writeCondition = membershipWriteCondition(table);
  return [
    pgPolicy(`${name}_select_policy`, {
      for: 'select',
      using: sql`
        ${tenantMatch(table)}
        AND (${membershipExists(table)} OR ${table.publicAccess} = true)
      `,
    }),
    pgPolicy(`${name}_insert_policy`, { for: 'insert', withCheck: writeCondition }),
    pgPolicy(`${name}_update_policy`, { for: 'update', using: writeCondition, withCheck: writeCondition }),
    pgPolicy(`${name}_delete_policy`, { for: 'delete', using: writeCondition }),
  ] as const;
};

/**
 * Org-owned CRUD policies for context entities (projects, workspaces, etc.).
 * SELECT includes createdBy match for RETURNING after INSERT (before membership exists).
 * INSERT requires tenant match + auth. UPDATE/DELETE require membership.
 */
export const orgOwnedCrudPolicies = (
  name: string,
  table: { tenantId: unknown; organizationId: unknown; createdBy: unknown },
) => {
  return [
    pgPolicy(`${name}_select_policy`, {
      for: 'select',
      using: sql`
        ${isAuthenticated}
        AND ${userContextSet}
        AND (
          ${table.createdBy} = current_setting('app.user_id', true)::text
          OR ${membershipExists(table)}
        )
      `,
    }),
    pgPolicy(`${name}_insert_policy`, {
      for: 'insert',
      withCheck: sql`${tenantMatch(table)} AND ${isAuthenticated}`,
    }),
    pgPolicy(`${name}_update_policy`, {
      for: 'update',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
      withCheck: sql`${tenantMatch(table)} AND ${isAuthenticated}`,
    }),
    pgPolicy(`${name}_delete_policy`, {
      for: 'delete',
      using: sql`${tenantMatch(table)} AND ${isAuthenticated} AND ${membershipExists(table)}`,
    }),
  ] as const;
};

/**
 * Public-access CRUD policies for public product entities (pages, docs, etc.).
 * SELECT: tenant match + (authenticated OR public access).
 * INSERT/UPDATE/DELETE: tenant match + authenticated.
 */
export const publicAccessCrudPolicies = (name: string, table: { tenantId: unknown; publicAccess: unknown }) => {
  const writeCondition = tenantWriteCondition(table);
  return [
    pgPolicy(`${name}_select_policy`, {
      for: 'select',
      using: sql`${publicAccessSelectCondition(table)}`,
    }),
    pgPolicy(`${name}_insert_policy`, {
      for: 'insert',
      withCheck: sql`${writeCondition}`,
    }),
    pgPolicy(`${name}_update_policy`, {
      for: 'update',
      using: sql`${writeCondition}`,
      withCheck: sql`${writeCondition}`,
    }),
    pgPolicy(`${name}_delete_policy`, {
      for: 'delete',
      using: sql`${writeCondition}`,
    }),
  ] as const;
};
