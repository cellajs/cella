import { TTLCache } from '#/lib/ttl-cache';
import type { TenantModel } from '#/modules/tenants/tenants-db';

const cache = new TTLCache<TenantModel>({ maxSize: 1000, defaultTtl: 60_000 });

/**
 * The cached tenant row, or else the one `read` resolves, cached for a minute.
 * @param tenantId - The tenant's id.
 * @param read - Reads the row; undefined for an unknown tenant.
 * @returns The row, or undefined for an unknown tenant, which is never cached.
 */
export const loadTenantCache = (tenantId: string, read: () => Promise<TenantModel | undefined>): Promise<TenantModel | undefined> =>
  cache.load(tenantId, read);

/** What a test seeds so the guard needs no database. */
export const setTenantCache = (tenantId: string, tenant: TenantModel): void => {
  cache.set(tenantId, tenant);
};

export const invalidateTenantCache = (tenantId: string): void => {
  cache.delete(tenantId);
};

export const clearTenantCache = (): void => {
  cache.clear();
};
