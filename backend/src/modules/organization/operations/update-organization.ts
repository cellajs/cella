import type { z } from '@hono/zod-openapi';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { assertNoWriteBetween } from '#/core/preconditions';
import { tenantContext } from '#/db/tenant-context';
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
 * `setupConfig` and `toolsConfig` are merge patches (RFC 7396) of the stored values. `organization.updated` handlers
 * run in the write's transaction, which reads soft-deleted rows.
 * @throws The refusals of `getValidChannel` for `update`; 409 `slug_exists` when another row holds the new slug; 400
 * `default_language_not_offered` when a sent language field leaves the default outside the languages.
 */
export async function updateOrganizationOp(ctx: ActorContext, id: string, rawInput: z.infer<typeof organizationUpdateBodySchema>) {
  const { organizationFlags, setupConfig, toolsConfig, ...input } = organizationContract.normalizeBody(rawInput);
  const actorId = ctx.var.actor.id;

  const { organization, membership, updatedRecord } = await tenantContext(
    ctx,
    async (txCtx) => {
      // Locked: the patches below merge into this row, so no other write may commit between the read and the update.
      const { entity: organization, membership } = await getValidChannel(txCtx, id, 'organization', 'update', { forUpdate: true });

      const { slug } = input;
      if (slug && slug !== organization.slug) {
        const slugAvailable = await checkSlugAvailable(txCtx, slug, 'organization');
        if (!slugAvailable) throw new AppError(409, 'slug_exists', 'warn', { entityType: 'organization', meta: { slug } });
      }

      // A row already inconsistent stays saveable while neither field is sent.
      if (input.languageCodes || input.defaultLanguageCode) {
        const languageCodes = input.languageCodes ?? organization.languageCodes;
        const defaultLanguageCode = input.defaultLanguageCode ?? organization.defaultLanguageCode;
        if (!languageCodes.includes(defaultLanguageCode))
          throw new AppError(400, 'default_language_not_offered', 'warn', { entityType: 'organization' });
      }

      // Media in the welcome text may reference only this organization's uploads.
      if (input.welcomeText) assertBlockMediaUrls(input.welcomeText, organization.id, 'organization', 'welcomeText');

      const values = {
        ...input,
        ...(organizationFlags && { organizationFlags: applyMergePatch(organization.organizationFlags, organizationFlags) }),
        ...(setupConfig && { setupConfig: applyMergePatch(organization.setupConfig, setupConfig) }),
        ...(toolsConfig && { toolsConfig: applyMergePatch(organization.toolsConfig, toolsConfig) }),
        ...updateStamps(actorId),
      };
      const updatedRecord = await updateOrganization(txCtx, { id: organization.id, values });
      if (!updatedRecord) assertNoWriteBetween(txCtx, 'organization', organization.id);
      await dispatchMutation(txCtx, 'organization.updated', {
        before: [withOrganizationDefaults(organization)],
        after: [withOrganizationDefaults(updatedRecord)],
      });
      return { organization, membership, updatedRecord };
    },
    { includeDeleted: true },
  );
  const updatedOrganizationRecord = withOrganizationDefaults(updatedRecord);

  invalidateCache.org(organization.tenantId, organization.id);
  await releaseReplacedImages({ holder: { organizationId: organization.id, tenantId: organization.tenantId }, before: organization, after: input });

  log.info('Organization updated', { organizationId: updatedOrganizationRecord.id });

  return toOrganizationResponse(ctx, updatedRecord, membership, { counts: true, membership: true });
}
