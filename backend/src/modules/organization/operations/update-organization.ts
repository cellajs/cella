import type { z } from '@hono/zod-openapi';
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
import { organizationContract, type organizationUpdateBodySchema } from '#/modules/organization/organization-schema';
import { getValidChannel } from '#/permissions';
import { log } from '#/utils/logger';
import { assertBlockMediaUrls } from '#/utils/validate-block-media';

/**
 * Updates an organization and returns it with its counts and the caller's membership.
 * @throws The refusals of `getValidChannel` for `update`; 409 `slug_exists` when another row holds the new slug.
 */
export async function updateOrganizationOp(ctx: ActorContext, id: string, rawInput: z.infer<typeof organizationUpdateBodySchema>) {
  const input = organizationContract.normalizeBody(rawInput);
  const actorId = ctx.var.actor.id;

  const { entity: organization, membership } = await getValidChannel(ctx, id, 'organization', 'update');

  const { slug } = input;

  if (slug && slug !== organization.slug) {
    const slugAvailable = await checkSlugAvailable(ctx, slug, 'organization');
    if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'organization', meta: { slug } });
  }

  // Media in the welcome text may reference only this organization's uploads.
  if (input.welcomeText) {
    assertBlockMediaUrls(input.welcomeText, organization.id, 'organization', 'welcomeText');
  }

  const values = { ...input, ...updateStamps(actorId) };
  const updatedRecord = await updateOrganization(ctx, { id: organization.id, values });
  const updatedOrganizationRecord = withOrganizationDefaults(updatedRecord);

  await dispatchMutation(ctx, 'organization.updated', { before: [withOrganizationDefaults(organization)], after: [updatedOrganizationRecord] });

  invalidateCache.org(organization.tenantId, organization.id);
  await releaseReplacedImages({ holder: { organizationId: organization.id, tenantId: organization.tenantId }, before: organization, after: input });

  log.info('Organization updated', { organizationId: updatedOrganizationRecord.id });

  return toOrganizationResponse(ctx, updatedRecord, membership, { counts: true, membership: true });
}
