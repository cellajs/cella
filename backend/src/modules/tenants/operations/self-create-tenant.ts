import { and, eq, notInArray } from 'drizzle-orm';
import type { AuthContext } from '#/core/context';
import { organizationsTable } from '#/modules/organization/organization-db';
import { createTenantForUser } from '#/modules/tenants/tenant-service';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { countDomainsByTenant } from '#/modules/tenants/tenants-queries';

interface SelfCreateTenantInput {
  name: string;
}

export async function selfCreateTenantOp(ctx: AuthContext, input: SelfCreateTenantInput) {
  const db = ctx.var.db;
  const user = ctx.var.user;

  // Multi-workspace: a user may own several tenants, each holding exactly one org via the 1:1
  // cap. Every call mints a fresh tenant for the caller.
  //
  // Reuse an orphan tenant (one this user created that has no org yet, from a prior attempt where
  // org creation failed after the tenant was made) to avoid piling up empty tenants on retry.
  // organizations.tenant_id is NOT NULL, so the NOT IN subquery has no NULL pitfall.
  const tenantsWithOrg = db.select({ tenantId: organizationsTable.tenantId }).from(organizationsTable);
  const [orphanTenant] = await db
    .select()
    .from(tenantsTable)
    .where(and(eq(tenantsTable.createdBy, user.id), notInArray(tenantsTable.id, tenantsWithOrg)))
    .limit(1);

  if (orphanTenant) {
    const domainsCount = await countDomainsByTenant(ctx, { targetTenantId: orphanTenant.id });
    return { ...orphanTenant, domainsCount };
  }

  const tenant = await createTenantForUser(db, {
    name: input.name,
    createdBy: user.id,
    userEmail: user.email,
  });

  const domainsCount = await countDomainsByTenant(ctx, { targetTenantId: tenant.id });
  return { ...tenant, domainsCount };
}
