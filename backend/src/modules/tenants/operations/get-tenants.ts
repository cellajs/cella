import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { findTenantsPaginated } from '#/modules/tenants/tenants-queries';
import type { tenantListQuerySchema } from '#/modules/tenants/tenants-schema';

type GetTenantsInput = z.infer<typeof tenantListQuerySchema>;

/** A page of tenants, searched by name and filtered by status, with their writers resolved, and the total. */
export async function getTenantsOp(ctx: UserContext, input: GetTenantsInput) {
  const { q, status, limit, offset, sort, order } = input;
  const { items, total } = await findTenantsPaginated(ctx, { q, status, sort, order, limit, offset });
  return { items: await withActorRefs(ctx, items), total };
}
