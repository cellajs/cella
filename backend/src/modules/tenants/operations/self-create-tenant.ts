import type { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { withActorRef } from '#/modules/actors/actor-refs';
import { createTenant } from '#/modules/tenants/operations/create-tenant';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { findOrphanTenant, findTenant, updateTenant } from '#/modules/tenants/tenants-queries';
import type { selfCreateTenantBodySchema } from '#/modules/tenants/tenants-schema';

type SelfCreateTenantInput = z.infer<typeof selfCreateTenantBodySchema>;

/**
 * Creates a tenant for the signed-in user, or reuses the one they created that holds no organization yet.
 * @throws AppError 500 `server_error` when the tenant it wrote cannot be read back.
 */
export async function selfCreateTenantOp(ctx: UserContext, input: SelfCreateTenantInput) {
  const actorId = ctx.var.actor.id;

  // A user may own several tenants, each holding exactly one org. Reuse a tenant this user created that holds no
  // organization yet, so retries do not pile up empty tenants. A retry may carry another name (its organization was
  // renamed): the reused tenant takes it.
  const orphanTenant = await findOrphanTenant(ctx, { createdBy: actorId });
  if (orphanTenant?.name === input.name) return withActorRef(ctx, orphanTenant);

  const { id } = orphanTenant
    ? await updateTenant(ctx, { id: orphanTenant.id, values: { name: input.name, ...updateStamps(actorId) } })
    : await createTenant(ctx, { name: input.name, createdBy: actorId, userEmail: ctx.var.user.email });

  const tenant = await findTenant(ctx, { where: eq(tenantsTable.id, id) });
  if (!tenant) throw new AppError(500, 'server_error', 'error', { meta: { reason: 'created_tenant_not_found', tenantId: id } });
  return withActorRef(ctx, tenant);
}
