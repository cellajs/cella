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
  listLtiInstallationTabsQuerySchema,
  listLtiResourceLinksQuerySchema,
  listLtiTabsQuerySchema,
  ltiTabRefusals,
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
  enabled: link.enabled,
  createdAt: link.createdAt,
  updatedAt: link.updatedAt,
  createdBy: link.createdBy,
  updatedBy: link.updatedBy,
});

/**
 * A resource link of the organization and its channel, for a caller who may update the channel.
 * @throws AppError 404 `not_found` for no such link, and what `getValidChannel` throws.
 */
async function getUpdatableLtiResourceLink(ctx: UserContext, id: string) {
  const link = await findLtiResourceLink(ctx, { id, organizationId: ctx.var.organizationId });
  if (!link) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'ltiResourceLink' } });
  const { entity } = await getValidChannel(ctx, link.channelId, link.channelType, 'update');
  return { link, channel: entity };
}

/** A refusal of `getValidChannel` that answers a question about the caller's access; anything else is thrown. */
const accessRefusal = (error: unknown) => {
  if (error instanceof AppError && ['forbidden', 'not_found', 'channel_archived'].includes(error.type)) return error;
  throw error;
};

/**
 * The course a tab in `channel` launches as (`placementContext`), for a caller who may update the channel: the channel
 * itself, or a channel above it with its name where the caller reads it. `refusal` is why the caller may not update a
 * course above, which placing the tab and switching it take; null when they may. Null when the tab launches as no course.
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

type LaunchCourse = Awaited<ReturnType<typeof launchCourse>>;

/** The error type placing a tab answers for its course: an archived course above, or one the caller may not update. */
const courseRefusal = (course: LaunchCourse) => {
  if (!course?.refusal) return null;
  return course.refusal.type === 'channel_archived' ? ('channel_archived' as const) : ('lti_context_update_required' as const);
};

/**
 * Throws what placing a tab in the channel, or switching it on or off, answers for its course: 403 `channel_archived`
 * for an archived course above, 403 `lti_context_update_required` for one the caller may not update.
 */
async function assertCoursePlaceable(ctx: UserContext, channelType: ChannelEntityType, channel: MembershipEntity) {
  const course = await launchCourse(ctx, channelType, channel);
  if (!course?.refusal) return;
  if (course.refusal.type === 'channel_archived') throw course.refusal;
  throw new AppError(403, 'lti_context_update_required', 'warn', { entityType: course.channelType });
}

/** The resource links placed in a channel, on or off, for a caller who may read it. */
export async function getLtiResourceLinksOp(ctx: UserContext, { channelType, channelId, orderBy }: z.infer<typeof listLtiResourceLinksQuerySchema>) {
  await getValidChannel(ctx, channelId, channelType, 'read');
  const links = await findLtiResourceLinks(ctx, { tenantId: ctx.var.tenantId, channelId, order: orderBy.order });
  return withActorRefs(ctx, links.map(toLtiResourceLink));
}

/**
 * A channel's tabs of LTI tools, for a caller who may update it: each approved LTI installation of the tenant, whether it
 * reads course members, the course a tab launches as, why the caller may not place it or switch it on, and its resource
 * link once placed.
 */
export async function getLtiTabsOp(ctx: UserContext, { channelType, channelId, orderBy }: z.infer<typeof listLtiTabsQuerySchema>) {
  const { tenantId } = ctx.var;
  const { entity } = await getValidChannel(ctx, channelId, channelType, 'update');
  const course = await launchCourse(ctx, channelType, entity);
  const records = await findLtiInstallations(ctx, { tenantId, order: orderBy.order });
  const links = await findLtiResourceLinks(ctx, { tenantId, channelId, order: 'asc' });
  return records
    .filter(({ installation }) => installation.approvedAt)
    .map(({ account, installation, client }) => {
      const link = links.find(({ installationId }) => installationId === account.id);
      const refusal: (typeof ltiTabRefusals)[number] | null = account.status !== 'active' ? 'lti_installation_disabled' : courseRefusal(course);
      return {
        id: account.id,
        name: client.name,
        status: account.status,
        readsMembers: installation.grantedScopes.some((scope) => ltiServiceScope(scope) === ltiNrps.scope),
        refusal,
        context: course && { channelType: course.channelType, channelId: course.channelId, name: course.name },
        resourceLink: link ? { id: link.id, title: link.title, enabled: link.enabled } : null,
      };
    });
}

/**
 * Every tab of an installation of the tenant in the organization, on or off, with its channel's name, the course it
 * launches as and whether the caller may remove it, for a caller who may update the organization. The courses whose
 * people the LTI tool reads are those of its tabs that are on.
 * @throws AppError 404 `not_found` for no LTI installation of the tenant.
 */
export async function getLtiInstallationTabsOp(
  ctx: UserContext,
  installationId: string,
  { orderBy }: z.infer<typeof listLtiInstallationTabsQuerySchema>,
) {
  const { tenantId, organizationId } = ctx.var;
  await getValidChannel(ctx, organizationId, 'organization', 'update');
  if (!(await findLtiInstallation(ctx, { id: installationId, tenantId })))
    throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'ltiInstallation' } });

  const links = await findLtiResourceLinks(ctx, { tenantId, installationId, organizationId, order: orderBy.order });
  const courses = new Map(links.map((link) => [link.id, placementContext(link)]));
  const named = [
    ...links.map(({ channelType, channelId }) => ({ channelType, channelId })),
    ...[...courses.values()].flatMap((course) => course ?? []),
  ];
  const names = new Map<string, string>();
  for (const channelType of new Set(named.map((channel) => channel.channelType))) {
    const ids = [...new Set(named.filter((channel) => channel.channelType === channelType).map((channel) => channel.channelId))];
    // Named without a read check: whoever may update the organization sees every place an LTI tool reads people.
    for (const channel of await resolveEntities(ctx, { entityType: channelType, ids })) names.set(channel.id, channel.name);
  }
  const deletable = new Set<string>();
  for (const channelType of new Set(links.map((link) => link.channelType))) {
    const ids = links.filter((link) => link.channelType === channelType).map((link) => link.channelId);
    for (const id of (await partitionByPermission(ctx, 'update', channelType, ids)).allowedIds) deletable.add(id);
  }
  // A link whose channel went between the two reads is left out: a channel takes its links along.
  return links.flatMap(({ id, channelType, channelId, enabled }) => {
    const channelName = names.get(channelId);
    if (channelName === undefined) return [];
    const course = courses.get(id);
    const context = course ? { channelType: course.channelType, channelId: course.channelId, name: names.get(course.channelId) ?? null } : null;
    return [{ id, channelType, channelId, channelName, enabled, context, deletable: deletable.has(channelId) }];
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
 * Places an approved, active LTI installation of the tenant in a channel as a tab that is on, for a caller who may
 * update the channel and the course it launches as (`launchCourse`). Its own token then reads the people of that course
 * (`ltiToolGuard`). A channel holds one tab of an installation.
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
  await assertCoursePlaceable(ctx, channelType, entity);
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

/**
 * Renames a resource link, replaces its custom values or switches its tab on or off, for a caller who may update its
 * channel. Switching takes the rights placing takes, and switching on an active installation.
 * @throws AppError 403 `channel_archived` or `lti_context_update_required` for the course a switch needs, 409
 *   `lti_installation_disabled` for switching on a disabled one, and what `getUpdatableLtiResourceLink` throws.
 */
export async function updateLtiResourceLinkOp(
  ctx: UserContext,
  id: string,
  changes: { title?: string; custom?: Record<string, string>; enabled?: boolean },
) {
  const { link, channel } = await getUpdatableLtiResourceLink(ctx, id);
  if (changes.enabled !== undefined && changes.enabled !== link.enabled) {
    await assertCoursePlaceable(ctx, link.channelType, channel);
    const found = changes.enabled && (await findLtiInstallation(ctx, { id: link.installationId, tenantId: ctx.var.tenantId }));
    if (found && found.account.status !== 'active')
      throw new AppError(409, 'lti_installation_disabled', 'warn', { meta: { installationId: link.installationId } });
  }
  const updated = await updateLtiResourceLink(ctx, { id: link.id, values: { ...changes, ...updateStamps(ctx.var.actor.id) } });
  if (changes.enabled !== undefined && changes.enabled !== link.enabled)
    log.info(`LTI resource link switched ${changes.enabled ? 'on' : 'off'}`, { resourceLinkId: link.id, installationId: link.installationId });
  return withActorRef(ctx, toLtiResourceLink(updated ?? link));
}

/** Removes a resource link with its live launch records, for a caller who may update its channel. */
export async function deleteLtiResourceLinkOp(ctx: UserContext, id: string) {
  const { link } = await getUpdatableLtiResourceLink(ctx, id);
  await deleteLtiResourceLink(ctx, { id: link.id });
  log.info('LTI resource link deleted', { resourceLinkId: link.id, installationId: link.installationId });
}
