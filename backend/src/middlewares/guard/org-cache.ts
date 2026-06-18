import { TTLCache } from '#/lib/ttl-cache';
import type { OrganizationModel } from '#/modules/organization/organization-db';

const cacheKey = (tenantId: string, orgId: string) => `${tenantId}:${orgId}`;

const cache = new TTLCache<OrganizationModel>({
  maxSize: 5000,
  defaultTtl: 60_000,
});

export const getOrgCache = (tenantId: string, orgId: string): OrganizationModel | undefined => {
  return cache.get(cacheKey(tenantId, orgId));
};

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

export const orgCacheStats = () => cache.stats;
