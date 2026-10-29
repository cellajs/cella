import { dropCachedApiKeys } from '#/middlewares/guard/api-key-cache';
import { dropCachedOrganization, dropCachedOrganizations } from '#/middlewares/guard/org-cache';
import { dropCachedSessions } from '#/middlewares/guard/session-cache';
import { dropCachedTenant } from '#/middlewares/guard/tenant-cache';
import { dropCachedTokenGrant, dropCachedTokenGrantsInTenant, dropCachedTokenGrantsOfUser } from '#/middlewares/guard/token-grant-cache';
import type { ServiceAccountModel } from '#/modules/service-accounts/service-accounts-db';

/**
 * The user's cached sessions, which carry the user row, system role and bindings version, and token verdicts: after a
 * write to the user's row or memberships.
 */
const user = (userId: string): void => {
  dropCachedSessions(userId);
  dropCachedTokenGrantsOfUser(userId);
};

/** After an organization's name or settings change, or its deletion. */
const org = (tenantId: string, organizationId: string): void => {
  dropCachedOrganization(tenantId, organizationId);
};

/** After tenant updates or deletion. Cascades to the tenant's organizations and the verdicts on its tokens. */
const tenant = (tenantId: string): void => {
  dropCachedTenant(tenantId);
  dropCachedOrganizations(tenantId);
  dropCachedTokenGrantsInTenant(tenantId);
};

/** After a service account's status or keys change: its API keys, and for an installed app the verdicts on its users' tokens. */
const serviceAccount = ({ id, tenantId, oauthClientId }: Pick<ServiceAccountModel, 'id' | 'tenantId' | 'oauthClientId'>): void => {
  dropCachedApiKeys(id);
  // An installed app: its users' grants in the tenant rest on the installation (`grantRefusal`).
  if (oauthClientId) dropCachedTokenGrantsInTenant(tenantId, oauthClientId);
};

/** After a grant is deleted: the verdicts on the tokens of the user who consented. */
const grant = (userId: string, grantId: string): void => {
  dropCachedTokenGrant(userId, grantId);
};

/**
 * Drops what a write changed from this process's guard caches; call it once the write has committed, so no request
 * caches the old row again in between. A read that was in flight at the drop stores nothing (`TTLCache.load`). The API
 * process also drops sessions on CDC reports of user, membership and system role changes. Other processes keep an
 * entry until it expires: 10 seconds for sessions, API keys and tenants, 15 for token verdicts, and a minute for
 * organizations, since no decision reads an organization field beyond its existence and id. Grants, the API keys
 * behind tokens and OAuth clients are read per request, and memberships are cached under the bindings version.
 */
export const invalidateCache = { user, org, tenant, serviceAccount, grant };
