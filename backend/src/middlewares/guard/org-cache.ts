import { TTLCache } from '#/lib/ttl-cache';
import type { OrganizationModel } from '#/modules/organization/organization-db';

const cacheKey = (tenantId: string, orgId: string) => `${tenantId}:${orgId}`;

const cache = new TTLCache<OrganizationModel>({ maxSize: 5000, defaultTtl: 60_000 });

/**
 * The cached organization row, or else the one `read` resolves, cached for a minute.
 * @param tenantId - The tenant the lookup is bound to.
 * @param orgId - The organization's id.
 * @param read - Reads the row within that tenant; undefined when it holds no such organization.
 * @returns The row, or undefined for an unknown organization, which is never cached.
 */
export const loadOrgCache = (
  tenantId: string,
  orgId: string,
  read: () => Promise<OrganizationModel | undefined>,
): Promise<OrganizationModel | undefined> => cache.load(cacheKey(tenantId, orgId), read);

export const setOrgCache = (tenantId: string, orgId: string, org: OrganizationModel): void => {
  cache.set(cacheKey(tenantId, orgId), org);
};

export const invalidateOrgCache = (tenantId: string, orgId: string): void => {
  cache.delete(cacheKey(tenantId, orgId));
};

/** Invalidate all cached orgs for a tenant (e.g. on tenant deletion) */
export const invalidateOrgCacheByTenant = (tenantId: string): number => {
  return cache.invalidateByPrefix(`${tenantId}:`);
};

export const clearOrgCache = (): void => {
  cache.clear();
};
