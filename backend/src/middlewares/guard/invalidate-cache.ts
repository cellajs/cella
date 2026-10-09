import type { ServiceAccountModel } from '#/modules/service-accounts/service-accounts-db';
import { invalidateApiKeyCacheByAccount } from './api-key-cache';
import { invalidateOrgCache, invalidateOrgCacheByTenant } from './org-cache';
import { dropCachedSessions } from './session-cache';
import { invalidateTenantCache } from './tenant-cache';
import { invalidateTokenGrant, invalidateTokenGrantsByActor, invalidateTokenGrantsByTenant } from './token-grant-cache';

/**
 * The user's cached sessions, which carry the user row, system role and bindings version, and token verdicts: after a
 * write to the user's row or memberships.
 */
function user(userId: string): void {
  dropCachedSessions(userId);
  invalidateTokenGrantsByActor(userId);
}

/** After org name/settings updates or org deletion. */
function org(tenantId: string, orgId: string): void {
  invalidateOrgCache(tenantId, orgId);
}

/** After tenant updates or deletion. Cascades to the tenant's organizations and the verdicts on its tokens. */
function tenant(tenantId: string): void {
  invalidateTenantCache(tenantId);
  invalidateOrgCacheByTenant(tenantId);
  invalidateTokenGrantsByTenant(tenantId);
}

/** After a service account's status or keys change: its API keys, and for an installed app the verdicts on its users' tokens. */
function serviceAccount({ id, tenantId, oauthClientId }: Pick<ServiceAccountModel, 'id' | 'tenantId' | 'oauthClientId'>): void {
  invalidateApiKeyCacheByAccount(id);
  // An installed app: its users' grants in the tenant rest on the installation (`grantRefusal`).
  if (oauthClientId) invalidateTokenGrantsByTenant(tenantId, oauthClientId);
}

/** After a grant is deleted: the verdicts on its tokens. */
function grant(accountId: string, grantId: string): void {
  invalidateTokenGrant(accountId, grantId);
}

/**
 * Drops what a write changed from this process's guard caches; call it once the write has committed, so no request
 * caches the old row again in between. A read that was in flight at the drop stores nothing (`TTLCache.load`). The API
 * process also drops sessions on CDC reports of user, membership and system role changes. Other processes keep an
 * entry until it expires: 10 seconds for sessions, 15 for token verdicts, a minute for the rest. Grants, the API keys
 * behind tokens and OAuth clients are read per request, and memberships are cached under the bindings version.
 */
export const invalidateCache = { user, org, tenant, serviceAccount, grant };
