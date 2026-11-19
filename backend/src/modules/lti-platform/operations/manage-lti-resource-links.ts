import type { z } from '@hono/zod-openapi';
import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { ltiNrps } from '#/lib/lti-vocabulary';
import { withActorRef, withActorRefs } from '#/modules/actors/actor-refs';
import { resolveEntities } from '#/modules/entities/entities-queries';
import { allowsLtiTab, holdsLtiTabs, linkContext } from '#/modules/lti-platform/helpers/context-channel';
import { launchOrigins } from '#/modules/lti-platform/helpers/launch-message';
import { ltiServiceScope } from '#/modules/lti-platform/helpers/lti-service-scopes';
import { opensFor } from '#/modules/lti-platform/helpers/tab-audience';
import type { LtiInstallationModel } from '#/modules/lti-platform/lti-installations-db';
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
import type { LtiAudience, LtiResourceLinkModel } from '#/modules/lti-platform/lti-resource-links-db';
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
  audience: link.audience,
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

/**
 * Refuses an installation a tab in a channel of `channelType` where it may not get one (`allowsLtiTab`): a type that
 * holds no tabs, or one an admin did not allow it in.
 * @throws AppError 409 `lti_channel_type_not_allowed` with the channel's type.
 */
const assertAllowsLtiTab = (installation: LtiInstallationModel, channelType: ChannelEntityType) => {
  if (!allowsLtiTab(installation, channelType)) throw new AppError(409, 'lti_channel_type_not_allowed', 'warn', { entityType: channelType });
};

/**
 * The tabs switched on in a channel that open for the caller (`opensFor`), as a launch decides it, for a caller who may
 * read the channel; none in a channel type that holds no tabs. Those switched off go to whoever may switch them
 * (`getLtiTabsOp`).
 */
export async function getLtiResourceLinksOp(ctx: UserContext, { channelType, channelId, orderBy }: z.infer<typeof listLtiResourceLinksQuerySchema>) {
  const { entity } = await getValidChannel(ctx, channelId, channelType, 'read');
  if (!holdsLtiTabs(channelType)) return [];
  const opener = { personId: ctx.var.user.id, memberships: ctx.var.memberships };
  const links = await findLtiResourceLinks(ctx, { tenantId: ctx.var.tenantId, channelId, order: orderBy.order });
  const opened = links.filter((link) => link.enabled && opensFor(link.audience, opener, channelType, entity));
  return withActorRefs(ctx, opened.map(toLtiResourceLink));
}

/**
 * A channel's tabs of LTI tools, for a caller who may update it: each approved LTI installation of the tenant that an
 * admin allowed in the channel's type, a disabled one or one not allowed there only where it has a tab, whether a tab
 * that is on lets it read who is in the channel, why the caller may not place it or switch it on, and its resource
 * link once placed. None in a channel type that holds no tabs.
 */
export async function getLtiTabsOp(ctx: UserContext, { channelType, channelId, orderBy }: z.infer<typeof listLtiTabsQuerySchema>) {
  const { tenantId } = ctx.var;
  await getValidChannel(ctx, channelId, channelType, 'update');
  if (!holdsLtiTabs(channelType)) return [];
  const isContext = !!linkContext({ channelType, channelId });
  const records = await findLtiInstallations(ctx, { tenantId, order: orderBy.order });
  const links = await findLtiResourceLinks(ctx, { tenantId, channelId, order: 'asc' });
  return records.flatMap(({ account, installation, client }) => {
    const link = links.find(({ installationId }) => installationId === account.id);
    const refusal: (typeof ltiTabRefusals)[number] | null =
      account.status !== 'active' ? 'lti_installation_disabled' : !allowsLtiTab(installation, channelType) ? 'lti_channel_type_not_allowed' : null;
    if (!installation.approvedAt || (refusal && !link)) return [];
    return [
      {
        id: account.id,
        name: client.name,
        launchOrigins: launchOrigins(client),
        createdAt: installation.createdAt,
        status: account.status,
        readsMembers: isContext && installation.grantedScopes.some((scope) => ltiServiceScope(scope) === ltiNrps.scope),
        refusal,
        resourceLink: link ? { id: link.id, title: link.title, enabled: link.enabled, audience: link.audience } : null,
      },
    ];
  });
}

/**
 * Every tab of an installation of the tenant in the organization, on or off, with its channel's name and whether the
 * caller may remove it, for a caller who may update the organization. The LTI tool reads the people of the channels of
 * its tabs that are on.
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
  const names = new Map<string, string>();
  const deletable = new Set<string>();
  for (const channelType of new Set(links.map((link) => link.channelType))) {
    const ids = links.filter((link) => link.channelType === channelType).map((link) => link.channelId);
    // Named without a read check: whoever may update the organization sees every place an LTI tool reads people.
    for (const channel of await resolveEntities(ctx, { entityType: channelType, ids })) names.set(channel.id, channel.name);
    for (const id of (await partitionByPermission(ctx, 'update', channelType, ids)).allowedIds) deletable.add(id);
  }
  // A link whose channel went between the two reads is left out: a channel takes its links along.
  return links.flatMap(({ id, channelType, channelId, enabled, audience }) => {
    const channelName = names.get(channelId);
    if (channelName === undefined) return [];
    return [{ id, channelType, channelId, channelName, enabled, audience, deletable: deletable.has(channelId) }];
  });
}

interface CreateLtiResourceLinkInput {
  channelType: ChannelEntityType;
  channelId: string;
  installationId: string;
  title: string;
  custom?: Record<string, string>;
  audience?: LtiAudience;
}

/**
 * Places an approved, active LTI installation of the tenant in a channel as a tab that is on, for a caller who may
 * update the channel. Its own token then reads the people of the channel when it is an LTI context (`ltiToolGuard`). A
 * channel holds one tab of an installation.
 * @throws AppError 404 `not_found` for no LTI installation of the tenant, 409 `lti_installation_not_approved` for one
 *   that waits for an approval, 409 `lti_channel_type_not_allowed` in a channel type it may not get a tab in, 409
 *   `lti_installation_disabled` for a disabled one, 409 `resource_already_exists` for one placed in the channel before,
 *   and what `getValidChannel` throws.
 */
export async function createLtiResourceLinkOp(
  ctx: UserContext,
  { channelType, channelId, installationId, title, custom = {}, audience = 'members' }: CreateLtiResourceLinkInput,
) {
  const { tenantId } = ctx.var;
  const { entity } = await getValidChannel(ctx, channelId, channelType, 'update');
  const found = await findLtiInstallation(ctx, { id: installationId, tenantId });
  if (!found) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'ltiInstallation' } });
  if (!found.installation.approvedAt) throw new AppError(409, 'lti_installation_not_approved', 'warn', { meta: { installationId } });
  assertAllowsLtiTab(found.installation, channelType);
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
      audience,
      createdBy: ctx.var.actor.id,
    },
  });
  log.info('LTI resource link created', { resourceLinkId: link.id, installationId, channelType, channelId });
  return withActorRef(ctx, toLtiResourceLink(link));
}

/**
 * Renames a resource link, replaces its custom values, changes whom its tab opens for or switches it on or off, for a
 * caller who may update its channel. Switching on takes an active installation allowed in the channel's type.
 * @throws AppError 409 `lti_channel_type_not_allowed` or `lti_installation_disabled` for switching on, and what
 *   `getUpdatableLtiResourceLink` throws.
 */
export async function updateLtiResourceLinkOp(
  ctx: UserContext,
  id: string,
  changes: { title?: string; custom?: Record<string, string>; enabled?: boolean; audience?: LtiAudience },
) {
  const link = await getUpdatableLtiResourceLink(ctx, id);
  if (changes.enabled && !link.enabled) {
    const found = await findLtiInstallation(ctx, { id: link.installationId, tenantId: ctx.var.tenantId });
    if (found && found.account.status !== 'active')
      throw new AppError(409, 'lti_installation_disabled', 'warn', { meta: { installationId: link.installationId } });
    if (found) assertAllowsLtiTab(found.installation, link.channelType);
  }
  const updated = await updateLtiResourceLink(ctx, { id: link.id, values: { ...changes, ...updateStamps(ctx.var.actor.id) } });
  if (changes.enabled !== undefined && changes.enabled !== link.enabled)
    log.info(`LTI resource link switched ${changes.enabled ? 'on' : 'off'}`, { resourceLinkId: link.id, installationId: link.installationId });
  return withActorRef(ctx, toLtiResourceLink(updated ?? link));
}

/**
 * Removes a tab for good, its resource link with its live launch records, for a caller who may update its channel.
 * @throws AppError what `getUpdatableLtiResourceLink` throws.
 */
export async function deleteLtiResourceLinkOp(ctx: UserContext, id: string) {
  const link = await getUpdatableLtiResourceLink(ctx, id);
  await deleteLtiResourceLink(ctx, { id: link.id });
  log.info('LTI resource link deleted', { resourceLinkId: link.id, installationId: link.installationId });
}
