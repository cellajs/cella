import { TTLCache } from '#/lib/ttl-cache';
import type { TenantModel } from '#/modules/tenants/tenants-db';

const tenantCache = new TTLCache<TenantModel>({ maxSize: 1000, defaultTtl: 10_000 });

/**
 * The cached tenant row, or else the one `read` resolves, cached for 10 seconds.
 * @param tenantId - The tenant's id.
 * @param read - Reads the row; undefined for an unknown tenant.
 * @returns The row, or undefined for an unknown tenant, which is never cached.
 */
export const loadCachedTenant = (tenantId: string, read: () => Promise<TenantModel | undefined>): Promise<TenantModel | undefined> =>
  tenantCache.load(tenantId, read);

/** What a test seeds so the guard needs no database. */
export const setTenantCache = (tenantId: string, tenant: TenantModel): void => {
  tenantCache.set(tenantId, tenant);
};

/** After a write to the tenant's row. */
export const dropCachedTenant = (tenantId: string): void => {
  tenantCache.delete(tenantId);
};

/** Drops every entry: what a test does to stand in for the TTL passing. */
export const clearTenantCache = (): void => {
  tenantCache.clear();
};
