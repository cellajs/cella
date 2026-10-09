import { findTenantById } from '#/db/prepared';
import { loadTenantCache } from '#/middlewares/guard/tenant-cache';
import { normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import type { TenantModel } from '#/modules/tenants/tenants-db';

/** The tenant row with normalized restrictions, from cache or the prepared lookup; undefined when unknown. */
export function loadTenant(tenantId: string): Promise<TenantModel | undefined> {
  return loadTenantCache(tenantId, async () => {
    const [row] = await findTenantById.execute({ id: tenantId });
    if (!row) return undefined;
    row.restrictions = normalizeRestrictions(row.restrictions);
    return row;
  });
}
