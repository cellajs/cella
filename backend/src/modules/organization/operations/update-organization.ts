import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { dispatchMutation } from '#/lib/mutation-bus';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { releaseReplacedImages } from '#/modules/attachment/operations/release-replaced-images';
import { checkSlugAvailable } from '#/modules/entities/operations/check-slug';
import { withOrganizationDefaults } from '#/modules/organization/helpers/select';
import { toOrganizationResponse } from '#/modules/organization/operations/to-organization-response';
import { updateOrganization } from '#/modules/organization/organization-queries';
import { organizationContract } from '#/modules/organization/organization-schema';
import { getValidChannel } from '#/permissions';
import { log } from '#/utils/logger';
import { assertBlockMediaUrls } from '#/utils/validate-block-media';

export async function updateOrganizationOp(ctx: ActorContext, id: string, rawInput: Record<string, unknown>) {
  // Normalize old-shape field names to their current names before any body access
  const input = organizationContract.normalizeBody(rawInput);
  const actorId = ctx.var.actor.id;

  // The tenant comparison is getValidChannel's: an organization of another tenant reads as missing.
  const { entity: organization, membership } = await getValidChannel(ctx, id, 'organization', 'update');

  const slug = input.slug as string | undefined;

  if (slug && slug !== organization.slug) {
    const slugAvailable = await checkSlugAvailable(ctx, slug, 'organization');
    if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'organization', meta: { slug } });
  }

  // Media in the welcome text may reference only this organization's uploads.
  if (input.welcomeText) {
    assertBlockMediaUrls(input.welcomeText as string, organization.id, 'organization', 'welcomeText');
  }

  const values = { ...input, ...updateStamps(actorId) };
  const updatedRecord = await updateOrganization(ctx, { id: organization.id, values });
  // Rows store organizationFlags/setupConfig sparse; merge config defaults under the stored bag
  const updatedOrganizationRecord = withOrganizationDefaults(updatedRecord);

  await dispatchMutation(ctx, 'organization.updated', { before: [withOrganizationDefaults(organization)], after: [updatedOrganizationRecord] });

  invalidateCache.org(organization.tenantId, organization.id);
  await releaseReplacedImages({ holder: { organizationId: organization.id, tenantId: organization.tenantId }, before: organization, after: input });

  log.info('Organization updated', { organizationId: updatedOrganizationRecord.id });

  return toOrganizationResponse(ctx, updatedRecord, membership, { counts: true, membership: true });
}
