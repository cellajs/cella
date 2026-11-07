import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { listedTenantKinds } from '#/modules/tenants/tenant-restrictions';
import { findTenantsPaginated } from '#/modules/tenants/tenants-queries';
import type { tenantListQuerySchema } from '#/modules/tenants/tenants-schema';
import type { PageWindow } from '#/utils/list-page';

type GetTenantsInput = z.infer<typeof tenantListQuerySchema>;

/**
 * A page of tenants, searched by name and filtered by status and kind (the listed kinds when the request names none),
 * with their writers resolved, and the total.
 */
export async function getTenantsOp(ctx: UserContext, input: GetTenantsInput, { offset, limit }: PageWindow) {
  const { q, status, kind, orderBy } = input;
  const kinds = kind.length ? kind : listedTenantKinds();
  const { items, total } = await findTenantsPaginated(ctx, { q, status, kinds, ...orderBy, limit, offset });
  return { items: await withActorRefs(ctx, items), total };
}
