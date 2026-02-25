/**
 * RLS context helpers for tenant isolation.
 *
 * These helpers wrap database operations in transactions with proper session
 * variables set. All tenant-scoped queries must use these wrappers to ensure
 * RLS policies are correctly applied.
 *
 * Session variables (transaction-scoped via set_config with true):
 * - app.tenant_id: Current tenant context
 * - app.user_id: Current authenticated user ID
 * - app.is_authenticated: Boolean auth status flag
 *
 */

import { sql } from 'drizzle-orm';
import { baseDb, type Tx } from './db';

/**
 * Tenant context options for authenticated routes.
 */
export interface TenantRlsOptions {
  /** Tenant ID from URL path (up to 24-char lowercase alphanumeric) */
  tenantId: string;
  /** Authenticated user ID */
  userId: string;
}

/**
 * User context options for cross-tenant queries (e.g., /me/memberships).
 * No tenant context, but user context is set.
 */
export interface UserRlsOptions {
  /** Authenticated user ID */
  userId: string;
}

/**
 * Wraps a database operation in a transaction with tenant context set.
 * All authenticated tenant-scoped queries must use this wrapper.
 *
 * The third parameter `true` in set_config makes variables transaction-scoped,
 * automatically resetting on commit/rollback. This prevents connection pool leakage.
 *
 * @param options - Tenant and user context from middleware
 * @param fn - Database operation to execute within the context
 * @returns Promise resolving to the operation result
 *
 * @example
 * ```typescript
 * const result = await setTenantRlsContext(
 *   { tenantId: 'abc123', userId: 'user_xyz' },
 *   async (tx) => {
 *     return tx.select().from(organizations);
 *   }
 * );
 * ```
 */
export async function setTenantRlsContext<T>(options: TenantRlsOptions, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return baseDb.transaction(async (tx) => {
    // Set session variables (transaction-scoped)
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${options.tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${options.userId}, true)`);
    await tx.execute(sql`SELECT set_config('app.is_authenticated', 'true', true)`);
    return fn(tx);
  });
}

/**
 * Wraps a database operation with user context only (no tenant context).
 * Used for cross-tenant user queries like /me/memberships.
 *
 * RLS policies for memberships allow cross-tenant SELECT when user_id matches,
 * enabling users to see all their memberships across tenants.
 *
 * @param options - User context from middleware
 * @param fn - Database operation to execute within the context
 * @returns Promise resolving to the operation result
 *
 * @example
 * ```typescript
 * const memberships = await setUserRlsContext(
 *   { userId: 'user_xyz' },
 *   async (tx) => {
 *     return tx.select().from(memberships);
 *   }
 * );
 * ```
 */
export async function setUserRlsContext<T>(options: UserRlsOptions, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return baseDb.transaction(async (tx) => {
    // Set user context only (no tenant context for cross-tenant reads)
    await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${options.userId}, true)`);
    await tx.execute(sql`SELECT set_config('app.is_authenticated', 'true', true)`);
    return fn(tx);
  });
}

/**
 * Wraps a public route database operation with tenant-only context.
 * Used for /public/:tenantId routes where no authentication is required.
 *
 * Sets is_authenticated=false so RLS policies only allow access to public rows
 * (e.g., entities with publicAccess=true or inherited public visibility).
 *
 * @param tenantId - Tenant ID from URL path
 * @param fn - Database operation to execute within the context
 * @returns Promise resolving to the operation result
 */
export async function setPublicRlsContext<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return baseDb.transaction(async (tx) => {
    // Set tenant context only (no user context for public access)
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', '', true)`);
    await tx.execute(sql`SELECT set_config('app.is_authenticated', 'false', true)`);
    return fn(tx);
  });
}
