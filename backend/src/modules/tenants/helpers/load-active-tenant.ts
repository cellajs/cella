import { AppError } from '#/core/error';
import { findTenantById } from '#/db/prepared';
import { getTenantCache, setTenantCache } from '#/middlewares/guard/tenant-cache';
import { normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import type { TenantModel } from '#/modules/tenants/tenants-db';

/** The tenant row with normalized restrictions, from cache or the prepared lookup; 404 when unknown, 403 unless active. */
export async function loadActiveTenant(tenantId: string): Promise<TenantModel> {
  let tenant = getTenantCache(tenantId);
  if (!tenant) {
    const [row] = await findTenantById.execute({ id: tenantId });
    if (!row) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'tenant' } });
    row.restrictions = normalizeRestrictions(row.restrictions);
    setTenantCache(tenantId, row);
    tenant = row;
  }
  if (tenant.status !== 'active')
    throw new AppError(403, 'forbidden', 'warn', { message: `Tenant is ${tenant.status}` });
  return tenant;
}
