import type { z } from '@hono/zod-openapi';
import { eq, ilike, type SQL } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { findTenantsPaginated } from '#/modules/tenants/tenants-queries';
import type { tenantListQuerySchema } from '#/modules/tenants/tenants-schema';
import { prepareStringForILikeFilter } from '#/utils/sql';

type GetTenantsInput = z.infer<typeof tenantListQuerySchema>;

export async function getTenantsOp(ctx: UserContext, input: GetTenantsInput) {
  const { q, status, limit, offset, sort, order } = input;

  const conditions: SQL[] = [];
  if (q) {
    const searchQuery = prepareStringForILikeFilter(q);
    conditions.push(ilike(tenantsTable.name, searchQuery));
  }
  if (status) {
    conditions.push(eq(tenantsTable.status, status));
  }

  const { items, total } = await findTenantsPaginated(ctx, { filters: conditions, sort, order, limit, offset });

  // Stored rows can predate a restriction field; one such row must not fail the whole list.
  return { items: items.map((item) => ({ ...item, restrictions: normalizeRestrictions(item.restrictions) })), total };
}
