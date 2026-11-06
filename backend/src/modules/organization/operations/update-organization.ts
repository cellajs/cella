import type { z } from '@hono/zod-openapi';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { assertNoWriteBetween } from '#/core/preconditions';
import { updateStamps } from '#/db/utils/stamps';
import { dispatchMutation } from '#/lib/mutation-bus';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { releaseReplacedImages } from '#/modules/attachment/operations/release-replaced-images';
import { checkSlugAvailable } from '#/modules/entities/operations/check-slug';
import { withOrganizationDefaults } from '#/modules/organization/helpers/select';
import { toOrganizationResponse } from '#/modules/organization/operations/to-organization-response';
import { updateOrganization } from '#/modules/organization/organization-queries';
import { organizationContract, type organizationUpdateBodySchema } from '#/modules/organization/organization-schema';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { log } from '#/utils/logger';
import { applyMergePatch } from '#/utils/merge-patch';
import { assertBlockMediaUrls } from '#/utils/validate-block-media';

/**
 * Updates an organization and returns it with its counts and the caller's membership. `organizationFlags`,
 * `setupConfig` and `toolsConfig` are merge patches (RFC 7396) of the stored values.
 * @throws The refusals of `getValidChannel` for `update`; 409 `slug_exists` when another row holds the new slug.
 */
export async function updateOrganizationOp(ctx: ActorContext, id: string, rawInput: z.infer<typeof organizationUpdateBodySchema>) {
  const { organizationFlags, setupConfig, toolsConfig, ...input } = organizationContract.normalizeBody(rawInput);
  const actorId = ctx.var.actor.id;

  const { organization, membership, updatedRecord } = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { ...ctx.var, db: tx } };
    // Locked: the patches below merge into this row, so no other write may commit between the read and the update.
    const { entity: organization, membership } = await getValidChannel(txCtx, id, 'organization', 'update', { forUpdate: true });

    const { slug } = input;
    if (slug && slug !== organization.slug) {
      const slugAvailable = await checkSlugAvailable(txCtx, slug, 'organization');
      if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'organization', meta: { slug } });
    }

    // Media in the welcome text may reference only this organization's uploads.
    if (input.welcomeText) {
      assertBlockMediaUrls(input.welcomeText, organization.id, 'organization', 'welcomeText');
    }

    const values = {
      ...input,
      ...(organizationFlags && { organizationFlags: applyMergePatch(organization.organizationFlags, organizationFlags) }),
      ...(setupConfig && { setupConfig: applyMergePatch(organization.setupConfig, setupConfig) }),
      ...(toolsConfig && { toolsConfig: applyMergePatch(organization.toolsConfig, toolsConfig) }),
      ...updateStamps(actorId),
    };
    const updatedRecord = await updateOrganization(txCtx, { id: organization.id, values });
    if (!updatedRecord) assertNoWriteBetween(txCtx, 'organization', organization.id);
    return { organization, membership, updatedRecord };
  });
  const updatedOrganizationRecord = withOrganizationDefaults(updatedRecord);

  await dispatchMutation(ctx, 'organization.updated', { before: [withOrganizationDefaults(organization)], after: [updatedOrganizationRecord] });

  invalidateCache.org(organization.tenantId, organization.id);
  await releaseReplacedImages({ holder: { organizationId: organization.id, tenantId: organization.tenantId }, before: organization, after: input });

  log.info('Organization updated', { organizationId: updatedOrganizationRecord.id });

  return toOrganizationResponse(ctx, updatedRecord, membership, { counts: true, membership: true });
}
