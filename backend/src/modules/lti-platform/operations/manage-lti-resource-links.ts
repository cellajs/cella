import type { z } from '@hono/zod-openapi';
import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { ltiNrps } from '#/lib/lti-vocabulary';
import type { MembershipEntity } from '#/lib/module';
import { withActorRef, withActorRefs } from '#/modules/actors/actor-refs';
import { resolveEntities } from '#/modules/entities/entities-queries';
import { placementContext } from '#/modules/lti-platform/helpers/context-channel';
import { ltiServiceScope } from '#/modules/lti-platform/helpers/lti-service-scopes';
import {
  deleteLtiResourceLink,
  findLtiInstallation,
  findLtiInstallations,
  findLtiResourceLink,
  findLtiResourceLinks,
  insertLtiResourceLink,
  updateLtiResourceLink,
} from '#/modules/lti-platform/lti-platform-queries';
import type {
  listLtiInstallationResourceLinksQuerySchema,
  listLtiResourceLinksQuerySchema,
  listPlaceableLtiInstallationsQuerySchema,
} from '#/modules/lti-platform/lti-platform-schema';
import type { LtiResourceLinkModel } from '#/modules/lti-platform/lti-resource-links-db';
import { channelIdColumnsOf } from '#/modules/memberships/helpers/membership-helpers';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { partitionByPermission } from '#/permissions/split-by-permission';
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

/** A refusal of `getValidChannel` that answers a question about the caller's access; anything else is thrown. */
const accessRefusal = (error: unknown) => {
  if (error instanceof AppError && ['forbidden', 'not_found', 'channel_archived'].includes(error.type)) return error;
  throw error;
};

/**
 * The course a tab in `channel` launches as (`placementContext`), for a caller who may update the channel: the channel
 * itself, or a channel above it with its name where the caller reads it. `refusal` is why the caller may not update a
 * course above, which adding the tab takes; null when they may. Null when the tab launches as no course.
 */
async function launchCourse(ctx: UserContext, channelType: ChannelEntityType, channel: MembershipEntity) {
  const course = placementContext({ channelType, channelId: channel.id, ...channelIdColumnsOf(channel) });
  if (!course) return null;
  if (course.channelId === channel.id) return { channelType, channelId: channel.id, name: channel.name, refusal: null };
  const updated = await getValidChannel(ctx, course.channelId, course.channelType, 'update').then(({ entity }) => entity, accessRefusal);
  const readable =
    updated instanceof AppError
      ? await getValidChannel(ctx, course.channelId, course.channelType, 'read').then(
          ({ entity }) => entity,
          () => null,
        )
      : updated;
  const refusal = updated instanceof AppError ? updated : null;
  return { channelType: course.channelType, channelId: course.channelId, name: readable?.name ?? null, refusal };
}

/** The resource links placed in a channel, for a caller who may read it. */
export async function getLtiResourceLinksOp(ctx: UserContext, { channelType, channelId, orderBy }: z.infer<typeof listLtiResourceLinksQuerySchema>) {
  await getValidChannel(ctx, channelId, channelType, 'read');
  const links = await findLtiResourceLinks(ctx, { tenantId: ctx.var.tenantId, channelId, order: orderBy.order });
  return withActorRefs(ctx, links.map(toLtiResourceLink));
}

/**
 * The approved LTI installations of the tenant, as a channel's tabs offer them to a caller who may update it: whether
 * each reads course members, whether it is disabled, whether the caller may place it there and the course a tab there
 * launches as.
 */
export async function getPlaceableLtiInstallationsOp(
  ctx: UserContext,
  { channelType, channelId, orderBy }: z.infer<typeof listPlaceableLtiInstallationsQuerySchema>,
) {
  const { entity } = await getValidChannel(ctx, channelId, channelType, 'update');
  const course = await launchCourse(ctx, channelType, entity);
  const records = await findLtiInstallations(ctx, { tenantId: ctx.var.tenantId, order: orderBy.order });
  return records
    .filter(({ installation }) => installation.approvedAt)
    .map(({ account, installation, client }) => ({
      id: account.id,
      name: client.name,
      readsMembers: installation.grantedScopes.some((scope) => ltiServiceScope(scope) === ltiNrps.scope),
      status: account.status,
      placeable: account.status === 'active' && !course?.refusal,
      context: course && { channelType: course.channelType, channelId: course.channelId, name: course.name },
    }));
}

/**
 * Every channel of the organization where an installation of the tenant has a tab, by name, for a caller who may update
 * the organization: the courses whose people the LTI tool may read follow from them.
 * @throws AppError 404 `not_found` for no LTI installation of the tenant.
 */
export async function getLtiInstallationResourceLinksOp(
  ctx: UserContext,
  installationId: string,
  { orderBy }: z.infer<typeof listLtiInstallationResourceLinksQuerySchema>,
) {
  const { tenantId, organizationId } = ctx.var;
  await getValidChannel(ctx, organizationId, 'organization', 'update');
  if (!(await findLtiInstallation(ctx, { id: installationId, tenantId })))
    throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'ltiInstallation' } });

  const links = await findLtiResourceLinks(ctx, { tenantId, installationId, organizationId, order: orderBy.order });
  const names = new Map<string, string>();
  const deletable = new Set<string>();
  for (const channelType of new Set(links.map((link) => link.channelType))) {
    const ids = links.filter((link) => link.channelType === channelType).map((link) => link.channelId);
    // Named without a read check: whoever may update the organization sees every place an LTI tool reads people.
    for (const channel of await resolveEntities(ctx, { entityType: channelType, ids })) names.set(channel.id, channel.name);
    for (const id of (await partitionByPermission(ctx, 'update', channelType, ids)).allowedIds) deletable.add(id);
  }
  // A link whose channel went between the two reads is left out: a channel takes its links along.
  return links.flatMap(({ id, channelType, channelId }) => {
    const channelName = names.get(channelId);
    return channelName === undefined ? [] : [{ id, channelType, channelId, channelName, deletable: deletable.has(channelId) }];
  });
}

interface CreateLtiResourceLinkInput {
  channelType: ChannelEntityType;
  channelId: string;
  installationId: string;
  title: string;
  custom?: Record<string, string>;
}

/**
 * Places an approved LTI installation of the tenant in a channel, for a caller who may update the channel and the
 * course it launches as (`launchCourse`). Its own token then reads the people of that course (`ltiToolGuard`). A channel
 * holds one tab of an installation.
 * @throws AppError 403 `lti_context_update_required` for a caller who may not update a course above the channel and
 *   403 `channel_archived` for an archived one, 404 `not_found` for no LTI installation of the tenant, 409
 *   `lti_installation_not_approved` for one that waits for an approval, 409 `lti_installation_disabled` for a disabled
 *   one, 409 `resource_already_exists` for one placed in the channel before, and what `getValidChannel` throws.
 */
export async function createLtiResourceLinkOp(
  ctx: UserContext,
  { channelType, channelId, installationId, title, custom = {} }: CreateLtiResourceLinkInput,
) {
  const { tenantId } = ctx.var;
  const { entity } = await getValidChannel(ctx, channelId, channelType, 'update');
  const course = await launchCourse(ctx, channelType, entity);
  if (course?.refusal?.type === 'channel_archived') throw course.refusal;
  if (course?.refusal) throw new AppError(403, 'lti_context_update_required', 'warn', { entityType: course.channelType });
  const found = await findLtiInstallation(ctx, { id: installationId, tenantId });
  if (!found) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'ltiInstallation' } });
  if (!found.installation.approvedAt) throw new AppError(409, 'lti_installation_not_approved', 'warn', { meta: { installationId } });
  if (found.account.status !== 'active') throw new AppError(409, 'lti_installation_disabled', 'warn', { meta: { installationId } });

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
