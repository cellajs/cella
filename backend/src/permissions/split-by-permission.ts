import {
  buildSubjectFromEntity,
  type ChannelEntityType,
  checkAccessBatch,
  draftVisibleTo,
  type EntityActionType,
  isChannel,
  type ProductEntityType,
} from 'shared';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { tenantRead } from '#/db/tenant-context';
import { resolveEntities } from '#/modules/entities/entities-queries';
import { accessFrom } from '#/permissions/access';
import { isArchivedFor } from '#/permissions/archive';
import { type DraftChannelRow, draftChannelVisibleTo } from '#/permissions/channel-collection-scope';
import { inRequestScope } from '#/permissions/get-valid-channel';

/** The draft rule of the single reads: a product draft shows to its author, a channel draft to whom its list shows it. */
const draftShowsTo = (ctx: ActorContext, entityType: ChannelEntityType | ProductEntityType, row: Record<string, unknown>): boolean =>
  isChannel(entityType) ? draftChannelVisibleTo(entityType, row as DraftChannelRow, accessFrom(ctx)) : draftVisibleTo(row, ctx.var.actor.id);

/**
 * Resolves `ids` and splits them into `allowedIds` / `rejectedIds` by whether the user may `action`: the batch twin of
 * `getValidProduct` and `getValidChannel`. An id is rejected when it does not resolve, resolves outside the request's
 * tenant or organization, names a draft that does not show to the caller, names a row the caller may not read or may
 * not `action` on, or names a row an archived channel closes to `action` (`isArchivedFor`). A bulk call never acts on
 * such a row, and `rejectedIds` keeps the request order, so the answer tells none of these apart.
 * @throws AppError 403 if no entities are allowed.
 */
export const splitByPermission = async (
  ctx: ActorContext,
  action: EntityActionType,
  entityType: ChannelEntityType | ProductEntityType,
  ids: string[],
) => {
  const split = await partitionByPermission(ctx, action, entityType, ids);
  if (!split.allowedIds.length) throw new AppError(403, 'forbidden', 'warn', { entityType });
  return split;
};

/** {@link splitByPermission} without the refusal: `allowedIds` may be empty. */
export const partitionByPermission = async (
  ctx: ActorContext,
  action: EntityActionType,
  entityType: ChannelEntityType | ProductEntityType,
  ids: string[],
) => {
  // Resolve entities (createdBy included for the owner relation).
  const resolved = await tenantRead(ctx, (readCtx) => resolveEntities(readCtx, { entityType, ids }));
  const entities = resolved.filter((entity) => inRequestScope(ctx, entity) && draftShowsTo(ctx, entityType, entity));

  // Each entity doubles as `row`, so row conditions and public read grants evaluate from real row data.
  const subjects = entities.map((entity) => buildSubjectFromEntity(entityType, entity));
  const access = accessFrom(ctx);
  const actions = action === 'read' ? [action] : (['read', action] as const);
  const decisions = actions.map((asked) => checkAccessBatch(access, asked, subjects));

  // A uuid column matches an id in any letter case, so a requested id is compared in the case the row stores.
  const allowed = new Set(
    entities
      .filter((entity, i) => !isArchivedFor(ctx, action, subjects[i]) && decisions.every((results) => results.get(entity.id)?.allowed))
      .map((entity) => entity.id),
  );
  const allowedIds: string[] = [];
  const rejectedIds: string[] = [];
  for (const id of new Set(ids)) {
    const stored = id.toLowerCase();
    if (!allowed.has(stored)) rejectedIds.push(id);
    else if (!allowedIds.includes(stored)) allowedIds.push(stored);
  }

  return { allowedIds, rejectedIds };
};
