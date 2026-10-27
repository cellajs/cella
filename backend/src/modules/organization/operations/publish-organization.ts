import type { UserContext } from '#/core/context';
import { dispatchMutation } from '#/lib/mutation-bus';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { dispatchDeferredInvites } from '#/modules/memberships/operations/deferred-invites';
import { withOrganizationDefaults } from '#/modules/organization/helpers/select';
import { toOrganizationResponse } from '#/modules/organization/operations/to-organization-response';
import { publishOrganization } from '#/modules/organization/organization-queries';
import { getValidChannel } from '#/permissions';
import { log } from '#/utils/logger';

/**
 * Publishes a draft organization, then sends the invitations it held. Safe to call again: on a published organization
 * it sends the invitations an earlier call left waiting, and nothing when there are none.
 */
export async function publishOrganizationOp(ctx: UserContext, id: string) {
  const { entity: organization, membership } = await getValidChannel(ctx, id, 'organization', 'update');

  const wasDraft = organization.publishedAt === null;
  const stamped = wasDraft ? await publishOrganization(ctx, { id: organization.id }) : undefined;

  if (stamped) {
    await dispatchMutation(ctx, 'organization.updated', {
      before: [withOrganizationDefaults(organization)],
      after: [withOrganizationDefaults(stamped)],
    });
    invalidateCache.org(organization.tenantId, organization.id);
    log.info('Organization published', { organizationId: organization.id });
  }

  // A draft another call published meanwhile is that call's to send for.
  const raced = wasDraft && !stamped;
  const { dispatched } = raced ? { dispatched: 0 } : await dispatchDeferredInvites(ctx, { channelIds: [organization.id] });

  const current = stamped ?? (raced ? (await getValidChannel(ctx, id, 'organization', 'update')).entity : organization);
  const response = await toOrganizationResponse(ctx, current, membership, { counts: true, membership: true });

  return { organization: response, invitationsSent: dispatched };
}
