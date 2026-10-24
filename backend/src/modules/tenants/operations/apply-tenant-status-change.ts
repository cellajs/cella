import { eq } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { endOrganizationStreams } from '#/modules/entities/helpers/session-streams';
import { rotateTenantMemberBindings } from '#/modules/memberships/memberships-queries';
import { organizationsTable } from '#/modules/organization/organization-db';

/**
 * What a tenant's status change does beyond its row. A membership of an archived tenant counts for no one
 * (`loadMemberships`), and no membership write announces the change, so the members' bindings version moves and their
 * open streams end; each client reconnects, and its catchup drops or brings back the organization.
 */
export async function applyTenantStatusChange(ctx: DbContext, tenantId: string): Promise<void> {
  for (const userId of await rotateTenantMemberBindings(ctx, { tenantId })) invalidateCache.user(userId);
  const organizations = await ctx.var.db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.tenantId, tenantId));
  await endOrganizationStreams(
    organizations.map(({ id }) => id),
    'The organization was archived or restored',
  );
}
