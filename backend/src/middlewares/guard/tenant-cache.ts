import { TTLCache } from '#/lib/ttl-cache';
import type { TenantModel } from '#/modules/tenants/tenants-db';

const cache = new TTLCache<TenantModel>({
  maxSize: 1000,
  defaultTtl: 60_000,
});

/** Also what a test seeds so the guard needs no database. */
export const getTenantCache = (tenantId: string): TenantModel | undefined => cache.get(tenantId);

export const setTenantCache = (tenantId: string, tenant: TenantModel): void => {
  cache.set(tenantId, tenant);
};

export const invalidateTenantCache = (tenantId: string): void => {
  cache.delete(tenantId);
};

export const clearTenantCache = (): void => {
  cache.clear();
};

export const tenantCacheStats = () => cache.stats;
