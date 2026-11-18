import type { z } from '@hono/zod-openapi';
import { type ChannelEntityType, hierarchy } from 'shared';
import type { DbContext, UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { updateStamps } from '#/db/utils/stamps';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { withActorRef, withActorRefs } from '#/modules/actors/actor-refs';
import {
  countLtiPlacements,
  deleteLtiResourceLink,
  findLtiInstallation,
  findLtiResourceLink,
  findLtiResourceLinks,
  insertLtiResourceLink,
  updateLtiResourceLink,
} from '#/modules/lti-platform/lti-platform-queries';
import type { listLtiResourceLinksQuerySchema } from '#/modules/lti-platform/lti-platform-schema';
import type { LtiResourceLinkModel } from '#/modules/lti-platform/lti-resource-links-db';
import { channelIdColumnsOf } from '#/modules/memberships/helpers/membership-helpers';
import type { ServiceAccountModel } from '#/modules/service-accounts/service-accounts-db';
import { lockServiceAccount, updateServiceAccountBindings } from '#/modules/service-accounts/service-accounts-queries';
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

type Placement = Pick<LtiResourceLinkModel, 'channelType' | 'channelId' | 'organizationId'>;

/**
 * Binds an installation to the channel of its new placement at the channel type's least privileged role, unless a
 * binding there exists. Runs in the transaction that inserts the placement, on the account it locked first: a lock
 * taken after the insert would deadlock two placements of one installation.
 */
async function bindPlacement(txCtx: DbContext, account: ServiceAccountModel, { channelType, channelId, organizationId }: Placement) {
  if (account.bindings.some((binding) => binding.channelId === channelId)) return;
  const role = hierarchy.getLeastPrivilegedRole(channelType);
  await updateServiceAccountBindings(txCtx, { id: account.id, bindings: [...account.bindings, { channelType, channelId, organizationId, role }] });
}

/**
 * Takes the installation's binding to a channel where it holds no placement any more, on the account the transaction
 * locked before the delete. The organization binding stays: every service account holds one from its creation, and the
 * service account rules read its role.
 */
async function unbindPlacement(txCtx: DbContext, account: ServiceAccountModel, { channelType, channelId }: Placement) {
  if (channelType === 'organization' || (await countLtiPlacements(txCtx, { installationId: account.id, channelId })) > 0) return;
  await updateServiceAccountBindings(txCtx, { id: account.id, bindings: account.bindings.filter((binding) => binding.channelId !== channelId) });
}

/** The resource links placed in a channel, for a caller who may read it. */
export async function getLtiResourceLinksOp(ctx: UserContext, { channelType, channelId, orderBy }: z.infer<typeof listLtiResourceLinksQuerySchema>) {
  await getValidChannel(ctx, channelId, channelType, 'read');
  const links = await findLtiResourceLinks(ctx, { tenantId: ctx.var.tenantId, channelId, order: orderBy.order });
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
 * Places an approved LTI installation of the tenant in a channel, for a caller who may update the channel. The
 * installation is bound to the channel (`bindPlacement`): its own token reads the channel's people there.
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

  const link = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const account = await lockServiceAccount(txCtx, { id: found.account.id });
    const values = { tenantId, channelType, channelId, ...channelIdColumnsOf(entity), installationId: found.account.id, title, custom };
    const inserted = await insertLtiResourceLink(txCtx, { values: { ...values, createdBy: ctx.var.actor.id } });
    if (account) await bindPlacement(txCtx, account, inserted);
    return inserted;
  });
  invalidateCache.serviceAccount(found.account);
  log.info('LTI resource link created', { resourceLinkId: link.id, installationId, channelType, channelId });
  return withActorRef(ctx, toLtiResourceLink(link));
}

/** Renames a resource link or replaces its custom values, for a caller who may update its channel. */
export async function updateLtiResourceLinkOp(ctx: UserContext, id: string, changes: { title?: string; custom?: Record<string, string> }) {
  const link = await getUpdatableLtiResourceLink(ctx, id);
  const updated = await updateLtiResourceLink(ctx, { id: link.id, values: { ...changes, ...updateStamps(ctx.var.actor.id) } });
  return withActorRef(ctx, toLtiResourceLink(updated ?? link));
}

/**
 * Removes a resource link with its live launch records, for a caller who may update its channel. The last one of its
 * installation in the channel takes the installation's binding there (`unbindPlacement`).
 */
export async function deleteLtiResourceLinkOp(ctx: UserContext, id: string) {
  const link = await getUpdatableLtiResourceLink(ctx, id);
  const account = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const locked = await lockServiceAccount(txCtx, { id: link.installationId });
    await deleteLtiResourceLink(txCtx, { id: link.id });
    if (locked) await unbindPlacement(txCtx, locked, link);
    return locked;
  });
  if (account) invalidateCache.serviceAccount(account);
  log.info('LTI resource link deleted', { resourceLinkId: link.id, installationId: link.installationId });
}
