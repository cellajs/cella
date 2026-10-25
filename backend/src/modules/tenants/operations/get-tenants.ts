import type { z } from '@hono/zod-openapi';
import { eq, type SQL } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { findTenantsPaginated } from '#/modules/tenants/tenants-queries';
import type { tenantListQuerySchema } from '#/modules/tenants/tenants-schema';
import { textSearchFilter } from '#/utils/sql';

type GetTenantsInput = z.infer<typeof tenantListQuerySchema>;

export async function getTenantsOp(ctx: UserContext, input: GetTenantsInput) {
  const { q, status, limit, offset, sort, order } = input;

  const conditions: SQL[] = [];
  if (q) conditions.push(textSearchFilter(tenantsTable.name, q));
  if (status) {
    conditions.push(eq(tenantsTable.status, status));
  }

  const { items, total } = await findTenantsPaginated(ctx, { filters: conditions, sort, order, limit, offset });
  return { items: await withActorRefs(ctx, items), total };
}
