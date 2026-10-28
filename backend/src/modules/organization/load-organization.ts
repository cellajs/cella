import { and, eq } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { loadCachedOrganization } from '#/middlewares/guard/org-cache';
import { type OrganizationModel, organizationsTable } from '#/modules/organization/organization-db';

interface LoadOrganizationOpts {
  tenantId: string;
  /** Lowercased, as the stored id is. */
  organizationId: string;
}

/** The tenant's organization by id, from cache or the database; undefined when the tenant holds none by that id. */
export function loadOrganization(ctx: DbContext, { tenantId, organizationId }: LoadOrganizationOpts): Promise<OrganizationModel | undefined> {
  return loadCachedOrganization(tenantId, organizationId, async () => {
    const [row] = await ctx.var.db
      .select()
      .from(organizationsTable)
      .where(and(eq(organizationsTable.id, organizationId), eq(organizationsTable.tenantId, tenantId)));
    return row;
  });
}
