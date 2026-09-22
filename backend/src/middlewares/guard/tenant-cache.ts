import { AppError } from '#/core/error';
import { findTenantById } from '#/db/prepared';
import { TTLCache } from '#/lib/ttl-cache';
import { normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import type { TenantModel } from '#/modules/tenants/tenants-db';

const cache = new TTLCache<TenantModel>({
  maxSize: 1000,
  defaultTtl: 60_000,
});

export const getTenantCache = (tenantId: string): TenantModel | undefined => {
  return cache.get(tenantId);
};

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

/** The tenant row with normalized restrictions, from cache or the prepared lookup; 404 when unknown, 403 unless active. */
export async function loadActiveTenant(tenantId: string): Promise<TenantModel> {
  let tenant = cache.get(tenantId);
  if (!tenant) {
    const [row] = await findTenantById.execute({ id: tenantId });
    if (!row) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });
    row.restrictions = normalizeRestrictions(row.restrictions);
    cache.set(tenantId, row);
    tenant = row;
  }
  if (tenant.status !== 'active')
    throw new AppError(403, 'forbidden', 'warn', { message: `Tenant is ${tenant.status}` });
  return tenant;
}
