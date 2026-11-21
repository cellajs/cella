import { findTenantById } from '#/db/prepared';
import { loadCachedTenant } from '#/middlewares/guard/tenant-cache';
import { normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import type { TenantModel } from '#/modules/tenants/tenants-db';

/** The tenant row with normalized restrictions, from cache or the prepared lookup; undefined when unknown. */
export function loadTenant(tenantId: string): Promise<TenantModel | undefined> {
  return loadCachedTenant(tenantId, async () => {
    const [row] = await findTenantById.execute({ id: tenantId });
    return row && { ...row, restrictions: normalizeRestrictions(row.restrictions) };
  });
}
