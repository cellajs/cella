import { eq } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { createTenantForUser } from '#/modules/tenants/tenant-service';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { countDomainsByTenant } from '#/modules/tenants/tenants-queries';

interface SelfCreateTenantInput {
  name: string;
}

export async function selfCreateTenantOp(ctx: AuthContext, input: SelfCreateTenantInput) {
  const db = ctx.var.db;
  const user = ctx.var.user;
  const memberships = ctx.var.memberships;

  // Block if user already has memberships (already in a tenant with orgs)
  if (memberships.length > 0) {
    throw new AppError(409, 'restrict_by_app', 'warn', {
      message: 'User already has tenant memberships',
    });
  }

  // If user already created a tenant (e.g. previous attempt where org creation failed), return it
  const [existingTenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.createdBy, user.id)).limit(1);

  if (existingTenant) {
    const domainsCount = await countDomainsByTenant(ctx, { targetTenantId: existingTenant.id });
    return { ...existingTenant, domainsCount };
  }

  const tenant = await createTenantForUser(db, {
    name: input.name,
    createdBy: user.id,
    userEmail: user.email,
  });

  const domainsCount = await countDomainsByTenant(ctx, { targetTenantId: tenant.id });
  return { ...tenant, domainsCount };
}
