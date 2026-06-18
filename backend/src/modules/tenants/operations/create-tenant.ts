import type { AuthContext } from '#/core/context';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { createTenantForUser } from '#/modules/tenants/tenant-service';
import type { tenantsTable } from '#/modules/tenants/tenants-db';
import { countDomainsByTenant, updateTenant } from '#/modules/tenants/tenants-queries';

interface CreateTenantInput {
  name: string;
  status?: string;
}

export async function createTenantOp(ctx: AuthContext, input: CreateTenantInput) {
  const db = ctx.var.db;
  const user = ctx.var.user;
  const { name, status } = input;

  const tenant = await createTenantForUser(
    db,
    {
      name,
      createdBy: user.id,
      userEmail: user.email,
    },
    ctx,
  );

  // Apply status override if provided (createTenantForUser defaults to 'active')
  if (status && status !== 'active') {
    const updated = await updateTenant(ctx, {
      targetTenantId: tenant.id,
      values: { status: status as typeof tenantsTable.$inferInsert.status },
    });
    invalidateCache.tenant(tenant.id);
    const domainsCount = await countDomainsByTenant(ctx, { targetTenantId: tenant.id });
    return { ...updated, domainsCount };
  }

  const domainsCount = await countDomainsByTenant(ctx, { targetTenantId: tenant.id });
  return { ...tenant, domainsCount };
}
