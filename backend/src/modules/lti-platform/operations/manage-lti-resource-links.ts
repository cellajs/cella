import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { withActorRef, withActorRefs } from '#/modules/actors/actor-refs';
import {
  deleteLtiResourceLink,
  findLtiInstallation,
  findLtiResourceLink,
  findLtiResourceLinks,
  insertLtiResourceLink,
  updateLtiResourceLink,
} from '#/modules/lti-platform/lti-platform-queries';
import type { LtiResourceLinkModel } from '#/modules/lti-platform/lti-resource-links-db';
import { channelIdColumnsOf } from '#/modules/memberships/helpers/membership-helpers';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { log } from '#/utils/logger';

/** A resource link as the routes answer it, its writers still ids. */
const toLtiResourceLink = (link: LtiResourceLinkModel) => ({
  id: link.id,
  channelType: link.channelType,
  channelId: link.channelId,
  installationId: link.installationId,
  title: link.title,
  custom: link.custom,
  createdAt: link.createdAt,
  updatedAt: link.updatedAt,
  createdBy: link.createdBy,
  updatedBy: link.updatedBy,
});

/**
 * A resource link of the organization, for a caller who may update its channel.
 * @throws AppError 404 `not_found` for no such link, and what `getValidChannel` throws.
 */
async function getUpdatableLtiResourceLink(ctx: UserContext, id: string) {
  const link = await findLtiResourceLink(ctx, { id, organizationId: ctx.var.organizationId });
  if (!link) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'ltiResourceLink' } });
  await getValidChannel(ctx, link.channelId, link.channelType, 'update');
  return link;
}

/** The resource links placed in a channel, for a caller who may read it. */
export async function getLtiResourceLinksOp(ctx: UserContext, { channelType, channelId }: { channelType: ChannelEntityType; channelId: string }) {
  await getValidChannel(ctx, channelId, channelType, 'read');
  const links = await findLtiResourceLinks(ctx, { tenantId: ctx.var.tenantId, channelId });
  return withActorRefs(ctx, links.map(toLtiResourceLink));
}

interface CreateLtiResourceLinkInput {
  channelType: ChannelEntityType;
  channelId: string;
  installationId: string;
  title: string;
  custom?: Record<string, string>;
}

/**
 * Places an approved LTI installation of the tenant in a channel, for a caller who may update the channel.
 * @throws AppError 404 `not_found` for no LTI installation of the tenant, 409 `lti_installation_not_approved` for one
 *   that waits for an approval, and what `getValidChannel` throws.
 */
export async function createLtiResourceLinkOp(
  ctx: UserContext,
  { channelType, channelId, installationId, title, custom = {} }: CreateLtiResourceLinkInput,
) {
  const { tenantId } = ctx.var;
  const { entity } = await getValidChannel(ctx, channelId, channelType, 'update');
  const found = await findLtiInstallation(ctx, { id: installationId, tenantId });
  if (!found) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'ltiInstallation' } });
  if (!found.installation.approvedAt) throw new AppError(409, 'lti_installation_not_approved', 'warn', { meta: { installationId } });

  const link = await insertLtiResourceLink(ctx, {
    values: {
      tenantId,
      channelType,
      channelId,
      ...channelIdColumnsOf(entity),
      installationId: found.account.id,
      title,
      custom,
      createdBy: ctx.var.actor.id,
    },
  });
  log.info('LTI resource link created', { resourceLinkId: link.id, installationId, channelType, channelId });
  return withActorRef(ctx, toLtiResourceLink(link));
}

/** Renames a resource link or replaces its custom values, for a caller who may update its channel. */
export async function updateLtiResourceLinkOp(ctx: UserContext, id: string, changes: { title?: string; custom?: Record<string, string> }) {
  const link = await getUpdatableLtiResourceLink(ctx, id);
  const updated = await updateLtiResourceLink(ctx, { id: link.id, values: { ...changes, ...updateStamps(ctx.var.actor.id) } });
  return withActorRef(ctx, toLtiResourceLink(updated ?? link));
}

/** Removes a resource link with its live launch records, for a caller who may update its channel. */
export async function deleteLtiResourceLinkOp(ctx: UserContext, id: string) {
  const link = await getUpdatableLtiResourceLink(ctx, id);
  await deleteLtiResourceLink(ctx, { id: link.id });
  log.info('LTI resource link deleted', { resourceLinkId: link.id, installationId: link.installationId });
}
