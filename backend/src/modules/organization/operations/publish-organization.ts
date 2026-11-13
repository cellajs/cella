import type { UserContext } from '#/core/context';
import { assertNoWriteBetween } from '#/core/preconditions';
import { tenantContext } from '#/db/tenant-context';
import { dispatchMutation } from '#/lib/mutation-bus';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { mailHeldInvitations } from '#/modules/memberships/operations/mail-invitations';
import { withOrganizationDefaults } from '#/modules/organization/helpers/select';
import { toOrganizationResponse } from '#/modules/organization/operations/to-organization-response';
import { publishOrganization } from '#/modules/organization/organization-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { log } from '#/utils/logger';

/**
 * Publishes a draft organization, then sends the invitations it held. Safe to call again: on a published organization
 * it sends the invitations still held, and nothing when there are none.
 */
export async function publishOrganizationOp(ctx: UserContext, id: string) {
  const { entity: organization, membership } = await getValidChannel(ctx, id, 'organization', 'update');

  const wasDraft = organization.publishedAt === null;
  // The publish and its `organization.updated` handlers commit together.
  const stamped = wasDraft
    ? await tenantContext(
        ctx,
        async (txCtx) => {
          const userTxCtx: UserContext = { var: { ...ctx.var, db: txCtx.var.db } };
          const published = await publishOrganization(userTxCtx, { id: organization.id });
          if (published) {
            await dispatchMutation(userTxCtx, 'organization.updated', {
              before: [withOrganizationDefaults(organization)],
              after: [withOrganizationDefaults(published)],
            });
          }
          return published;
        },
        { includeDeleted: true },
      )
    : undefined;

  if (stamped) {
    invalidateCache.org(organization.tenantId, organization.id);
    log.info('Organization published', { organizationId: organization.id });
  }

  const raced = wasDraft && !stamped;
  if (raced) assertNoWriteBetween(ctx, 'organization', organization.id);
  // Of two calls, the one whose release claims the held invitations mails them.
  const mailed = await mailHeldInvitations(ctx, { channelIds: [organization.id], organization, by: ctx.var.user.id });

  const current = stamped ?? (raced ? (await getValidChannel(ctx, id, 'organization', 'update')).entity : organization);
  const response = await toOrganizationResponse(ctx, current, membership, { counts: true, membership: true });

  return { organization: response, invitationCount: mailed.length };
}
