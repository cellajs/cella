import { findTenantById } from '#/db/prepared';
import { getTenantCache, setTenantCache } from '#/middlewares/guard/tenant-cache';
import { normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import type { TenantModel } from '#/modules/tenants/tenants-db';

/** The tenant row with normalized restrictions, from cache or the prepared lookup; undefined when unknown. */
export async function loadTenant(tenantId: string): Promise<TenantModel | undefined> {
  const cached = getTenantCache(tenantId);
  if (cached) return cached;

  const [row] = await findTenantById.execute({ id: tenantId });
  if (!row) return undefined;
  row.restrictions = normalizeRestrictions(row.restrictions);
  setTenantCache(tenantId, row);
  return row;
}
