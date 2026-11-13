import type { DbContext } from '#/core/context';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { closeOrganizationStreams } from '#/modules/entities/helpers/session-streams';
import { rotateTenantMemberBindings } from '#/modules/memberships/memberships-queries';
import { findOrganizationByTenant } from '#/modules/organization/organization-queries';

/**
 * What a tenant's status change does beyond its row, after its commit. The tenant's cached rows go. A membership of a
 * deleted tenant counts for no one (`loadMemberships`), and no membership write announces the change. The members'
 * bindings version moves and their open streams close; each client reconnects, and its catchup drops or brings back the
 * organization.
 */
export async function applyTenantStatusChange(ctx: DbContext, tenantId: string): Promise<void> {
  invalidateCache.tenant(tenantId);
  for (const userId of await rotateTenantMemberBindings(ctx, { tenantId })) invalidateCache.user(userId);
  const organization = await findOrganizationByTenant(ctx, { tenantId });
  if (organization) await closeOrganizationStreams([organization.id]);
}
