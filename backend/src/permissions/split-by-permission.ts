import { type ChannelEntityType, type ChannelIdColumns, draftVisibleTo, type EntityActionType, isChannel, type ProductEntityType } from 'shared';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { tenantRead } from '#/db/tenant-context';
import { resolveEntities } from '#/modules/entities/entities-queries';
import { checkAccessBatch } from '#/permissions';
import { accessFrom, actorFrom } from '#/permissions/access';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { type DraftChannelRow, draftChannelVisibleTo } from '#/permissions/channel-collection-scope';

type ScopedRow = { id: string; tenantId?: string; organizationId?: string | null };

/** A row is in scope when it matches every id the guard chain set; the organization row itself carries no `organizationId`. */
const inRequestScope = (ctx: ActorContext, row: ScopedRow): boolean => {
  const { tenantId, organizationId } = ctx.var;
  if (tenantId && 'tenantId' in row && row.tenantId !== tenantId) return false;
  if (organizationId && 'organizationId' in row && row.organizationId !== organizationId) return false;
  return true;
};

/** The draft rule of the single reads: a product draft shows to its author, a channel draft to whom its list shows it. */
const draftShowsTo = (ctx: ActorContext, entityType: ChannelEntityType | ProductEntityType, row: Record<string, unknown>): boolean =>
  isChannel(entityType)
    ? draftChannelVisibleTo(entityType, row as DraftChannelRow, ctx.var.actor.bindings, actorFrom(ctx))
    : draftVisibleTo(row, ctx.var.actor.id);

/**
 * Resolves `ids` and splits them into `allowedIds` / `rejectedIds` by whether the user may `action`: the batch twin of
 * `getValidProduct` and `getValidChannel`. An id is rejected when it does not resolve, resolves outside the request's
 * tenant or organization, names a draft that does not show to the caller, or names a row the caller may not read or
 * may not `action` on. A bulk call never acts on such a row, and `rejectedIds` keeps the request order, so the answer
 * tells none of these apart.
 * @param entityType - The type of entity (channel or product, not user).
 * @throws {AppError} 403 if no entities are allowed.
 */
export const splitByPermission = async (
  ctx: ActorContext,
  action: EntityActionType,
  entityType: ChannelEntityType | ProductEntityType,
  ids: string[],
) => {
  // Resolve entities (createdBy included for the owner relation); auto-wrap in tenantRead outside an RLS context.
  const resolved =
    ctx.var.db === baseDb
      ? await tenantRead(ctx, (readCtx) => resolveEntities(readCtx, { entityType, ids }))
      : await resolveEntities(ctx, { entityType, ids });
  const entities = resolved.filter((entity) => inRequestScope(ctx, entity as ScopedRow) && draftShowsTo(ctx, entityType, entity));

  // Each entity doubles as `row`, so row conditions and public read grants evaluate from real row data.
  const subjects = entities.map((entity) =>
    buildSubjectFromEntity(entityType, entity as { id: string; createdBy?: string | null } & Partial<ChannelIdColumns>),
  );
  const access = accessFrom(ctx);
  const actions = action === 'read' ? [action] : (['read', action] as const);
  const decisions = actions.map((asked) => checkAccessBatch(access, asked, subjects).results);

  const allowed = new Set(entities.map((entity) => entity.id).filter((id) => decisions.every((results) => results.get(id)?.allowed)));
  const requested = [...new Set(ids)];
  const allowedIds = requested.filter((id) => allowed.has(id));
  const rejectedIds = requested.filter((id) => !allowed.has(id));

  if (!allowedIds.length) throw new AppError(403, 'forbidden', 'warn', { entityType });

  return { allowedIds, rejectedIds };
};
