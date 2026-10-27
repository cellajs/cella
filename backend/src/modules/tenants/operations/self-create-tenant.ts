import { eq } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { withActorRef } from '#/modules/actors/actor-refs';
import { createTenantForUser } from '#/modules/tenants/tenant-service';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { findOrphanTenant, findTenant, updateTenant } from '#/modules/tenants/tenants-queries';

interface SelfCreateTenantInput {
  name: string;
}

export async function selfCreateTenantOp(ctx: UserContext, input: SelfCreateTenantInput) {
  const db = ctx.var.db;
  const user = ctx.var.user;

  // A user may own several tenants, each holding exactly one org. Reuse an orphan tenant (created by
  // this user with no org yet) so retries do not pile up empty tenants; organizations.tenant_id is NOT NULL.
  // A retry may carry another name (its organization was renamed): the reused tenant takes it.
  const orphanTenant = await findOrphanTenant(ctx, { createdBy: user.id });
  if (orphanTenant?.name === input.name) return withActorRef(ctx, orphanTenant);

  const { id } = orphanTenant
    ? await updateTenant(ctx, { targetTenantId: orphanTenant.id, values: { name: input.name, ...updateStamps(user.id) } })
    : await createTenantForUser(db, { name: input.name, createdBy: user.id, userEmail: user.email });

  const tenant = await findTenant(ctx, { where: eq(tenantsTable.id, id) });
  if (!tenant) throw new AppError(500, 'server_error', 'error', { meta: { reason: 'created_tenant_not_found', tenantId: id } });
  return withActorRef(ctx, tenant);
}
