/**
 * RLS (Row-Level Security) policy building blocks.
 *
 * These helpers define reusable SQL fragments for consistent RLS policy definitions
 * across all tenant-scoped tables. They follow the fail-closed principle:
 * missing context always results in denied access.
 *
 * Session variables used:
 * - app.tenant_id: Current tenant context (from URL path)
 * - app.user_id: Current authenticated user ID
 * - app.is_authenticated: Boolean flag for auth status
 *
 * Policy types:
 * - Standard strict: Product entities with membership verification
 * - Public-aware: Entities with is_public column for unauthenticated read
 * - Cross-tenant read: Context entities that users can read across tenants
 *
 * @see info/RLS.md for full architecture documentation
 */

import { sql } from 'drizzle-orm';

// ============================================================================
// Session Context Checks (fail-closed)
// ============================================================================

/**
 * Check if tenant context is set (fail-closed).
 * Returns false when app.tenant_id is not set or is empty string.
 */
export const tenantContextSet = sql`COALESCE(current_setting('app.tenant_id', true), '') != ''`;

/**
 * Check if user context is set (fail-closed).
 * Returns false when app.user_id is not set or is empty string.
 */
export const userContextSet = sql`COALESCE(current_setting('app.user_id', true), '') != ''`;

/**
 * Check if current session is authenticated.
 * Returns false when app.is_authenticated is not set or is false.
 */
export const isAuthenticated = sql`current_setting('app.is_authenticated', true)::boolean = true`;

// ============================================================================
// Match Helpers
// ============================================================================

/**
 * Check if row's tenant_id matches current session context.
 * Includes fail-closed check for missing tenant context.
 *
 * @param t - Table reference with tenantId column
 */
export const tenantMatch = (t: { tenantId: unknown }) => sql`
  ${tenantContextSet}
  AND ${t.tenantId} = current_setting('app.tenant_id', true)::text
`;

/**
 * Check if row's user_id matches current session context.
 * Used for cross-tenant membership SELECT (users can see their own memberships).
 * Includes fail-closed check for missing user context.
 *
 * @param t - Table reference with userId column
 */
export const userMatch = (t: { userId: unknown }) => sql`
  ${userContextSet}
  AND ${t.userId} = current_setting('app.user_id', true)::text
`;

// ============================================================================
// Membership Verification
// ============================================================================

/**
 * Check if current user has membership in the row's organization.
 * Used for product entity policies to verify org access.
 * Includes fail-closed check for missing user context.
 * Also includes tenant match in EXISTS for defense against data corruption.
 *
 * @param t - Table reference with organizationId and tenantId columns
 */
export const membershipExists = (t: { organizationId: unknown; tenantId: unknown }) => sql`
  ${userContextSet}
  AND EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = ${t.organizationId}
    AND m.user_id = current_setting('app.user_id', true)::text
    AND m.tenant_id = ${t.tenantId}
  )
`;

// ============================================================================
// Combined Policy Conditions
// ============================================================================

/**
 * Standard tenant-scoped write condition.
 * Requires: authenticated + matching tenant context.
 * Used for INSERT/UPDATE/DELETE on all tenant-scoped tables.
 *
 * @param t - Table reference with tenantId column
 */
export const tenantWriteCondition = (t: { tenantId: unknown }) => sql`
  ${tenantMatch(t)}
  AND ${isAuthenticated}
`;

/**
 * Membership-verified write condition.
 * Requires: authenticated + matching tenant + membership in org.
 * Used for product entity INSERT/UPDATE/DELETE.
 *
 * @param t - Table reference with tenantId and organizationId columns
 */
export const membershipWriteCondition = (t: { tenantId: unknown; organizationId: unknown }) => sql`
  ${tenantMatch(t)}
  AND ${isAuthenticated}
  AND ${membershipExists(t)}
`;

/**
 * Cross-tenant user SELECT condition.
 * User can read their own rows across tenants OR within current tenant with org membership.
 * Used for memberships SELECT policy.
 *
 * @param t - Table reference with tenantId, userId, and organizationId columns
 */
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

// ============================================================================
// Public Access Conditions
// ============================================================================

/**
 * Check if row is publicly accessible OR user is authenticated.
 * Used for entities with publicAccess column where unauthenticated users
 * can read public rows, but all rows are visible to authenticated users.
 *
 * @param t - Table reference with publicAccess column
 */
export const publicOrAuthenticated = (t: { publicAccess: unknown }) => sql`
  ${isAuthenticated} OR ${t.publicAccess} = true
`;

/**
 * Public access SELECT condition.
 * Requires: matching tenant + (authenticated OR publicAccess=true).
 * Used for tenant-scoped entities with optional public visibility.
 *
 * @param t - Table reference with tenantId and publicAccess columns
 */
export const publicAccessSelectCondition = (t: { tenantId: unknown; publicAccess: unknown }) => sql`
  ${tenantMatch(t)}
  AND ${publicOrAuthenticated(t)}
`;

// ============================================================================
// Database Role References
// ============================================================================

/**
 * Reference to existing runtime_role for policy definitions.
 * Use .existing() to prevent Drizzle from trying to create the role.
 */
// Note: Import pgRole from 'drizzle-orm/pg-core' when defining policies
// export const runtimeRole = pgRole('runtime_role').existing();
// export const adminRole = pgRole('admin_role').existing();
// export const publicReadRole = pgRole('public_read_role').existing();
// export const cdcRole = pgRole('cdc_role').existing();

// ============================================================================
// Policy Names (for consistency across tables)
// ============================================================================

/**
 * Standard policy name pattern: {table}_{operation}_policy
 */
export const policyNames = {
  select: (tableName: string) => `${tableName}_select_policy`,
  insert: (tableName: string) => `${tableName}_insert_policy`,
  update: (tableName: string) => `${tableName}_update_policy`,
  delete: (tableName: string) => `${tableName}_delete_policy`,
  contextGuard: (tableName: string) => `${tableName}_context_guard`,
} as const;
