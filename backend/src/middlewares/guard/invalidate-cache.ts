import { invalidateAuthCacheByUser } from './auth-cache';
import { invalidateOrgCache, invalidateOrgCacheByTenant } from './org-cache';
import { invalidateTenantCache } from './tenant-cache';

/** Drops the cached session and memberships. Call after profile updates, membership changes, or sign-out. */
function user(userId: string): void {
  invalidateAuthCacheByUser(userId);
}

/** Call after org name/settings updates or org deletion. */
function org(tenantId: string, orgId: string): void {
  invalidateOrgCache(tenantId, orgId);
}

/** Call after tenant updates or deletion. Cascades to the org cache, whose keys are prefixed by tenantId. */
function tenant(tenantId: string): void {
  invalidateTenantCache(tenantId);
  invalidateOrgCacheByTenant(tenantId);
}

export const invalidateCache = { user, org, tenant };
