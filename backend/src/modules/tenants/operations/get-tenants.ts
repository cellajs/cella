import type { z } from '@hono/zod-openapi';
import { eq, ilike, type SQL } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import { tenantsTable } from '#/db/schema/tenants';
import { getTenantsList } from '#/modules/tenants/tenants-queries';
import type { tenantListQuerySchema } from '#/modules/tenants/tenants-schema';
import { prepareStringForILikeFilter } from '#/utils/sql';

type GetTenantsInput = z.infer<typeof tenantListQuerySchema>;

export async function getTenantsOp(ctx: AuthContext, input: GetTenantsInput) {
  const { q, status, limit, offset, sort, order } = input;

  // Build where conditions
  const conditions: SQL[] = [];
  if (q) {
    const searchQuery = prepareStringForILikeFilter(q);
    conditions.push(ilike(tenantsTable.name, searchQuery));
  }
  if (status) {
    conditions.push(eq(tenantsTable.status, status));
  }

  const { items, total } = await getTenantsList(ctx, { filters: conditions, sort, order, limit, offset });

  return { items, total };
}
