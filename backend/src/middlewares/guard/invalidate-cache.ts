import { invalidateAuthCacheByUser } from './auth-cache';
import { invalidateOrgCache, invalidateOrgCacheByTenant } from './org-cache';
import { invalidateTenantCache } from './tenant-cache';

/**
 * Invalidate cached auth data (session + memberships) for a user.
 *
 * Call after any mutation that affects the user's identity or permissions:
 * user profile updates, membership changes, session deletion, sign-out, etc.
 */
function user(userId: string): void {
  invalidateAuthCacheByUser(userId);
}

/**
 * Invalidate cached organization data.
 *
 * Call after org name/settings updates or org deletion.
 */
function org(tenantId: string, orgId: string): void {
  invalidateOrgCache(tenantId, orgId);
}

/**
 * Invalidate cached tenant data and all associated org cache entries.
 *
 * Call after tenant updates or deletion. Cascades to org cache because
 * org cache keys are prefixed by tenantId.
 */
function tenant(tenantId: string): void {
  invalidateTenantCache(tenantId);
  invalidateOrgCacheByTenant(tenantId);
}

export const invalidateCache = { user, org, tenant };
