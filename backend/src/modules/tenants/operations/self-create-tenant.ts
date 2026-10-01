import { and, eq, notInArray } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { organizationsTable } from '#/modules/organization/organization-db';
import { createTenantForUser } from '#/modules/tenants/tenant-service';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { findTenant } from '#/modules/tenants/tenants-queries';

interface SelfCreateTenantInput {
  name: string;
}

export async function selfCreateTenantOp(ctx: UserContext, input: SelfCreateTenantInput) {
  const db = ctx.var.db;
  const user = ctx.var.user;

  // A user may own several tenants, each holding exactly one org. Reuse an orphan tenant (created by
  // this user with no org yet) so retries do not pile up empty tenants; organizations.tenant_id is NOT NULL.
  const tenantsWithOrg = db.select({ tenantId: organizationsTable.tenantId }).from(organizationsTable);
  const orphanTenant = await findTenant(ctx, {
    where: and(eq(tenantsTable.createdBy, user.id), notInArray(tenantsTable.id, tenantsWithOrg)),
  });
  if (orphanTenant) return orphanTenant;

  const { id } = await createTenantForUser(db, { name: input.name, createdBy: user.id, userEmail: user.email });

  const tenant = await findTenant(ctx, { where: eq(tenantsTable.id, id) });
  if (!tenant) throw new AppError(500, 'server_error', 'error', { meta: { reason: 'created_tenant_not_found', tenantId: id } });
  return tenant;
}
