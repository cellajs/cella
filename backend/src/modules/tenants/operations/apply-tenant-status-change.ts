import type { DbContext } from '#/core/context';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { endOrganizationStreams } from '#/modules/entities/helpers/session-streams';
import { rotateTenantMemberBindings } from '#/modules/memberships/memberships-queries';
import { findOrganizationByTenant } from '#/modules/organization/organization-queries';

/**
 * What a tenant's status change does beyond its row. A membership of an archived tenant counts for no one
 * (`loadMemberships`), and no membership write announces the change, so the members' bindings version moves and their
 * open streams end; each client reconnects, and its catchup drops or brings back the organization.
 */
export async function applyTenantStatusChange(ctx: DbContext, tenantId: string): Promise<void> {
  for (const userId of await rotateTenantMemberBindings(ctx, { tenantId })) invalidateCache.user(userId);
  const organization = await findOrganizationByTenant(ctx, { tenantId });
  if (organization) await endOrganizationStreams([organization.id], 'The organization was archived or restored');
}
