import type { ChannelEntityType, EntityActionType } from 'shared';
import { buildSubjectFromEntity, checkAccess } from 'shared';
import type { ActorBinding, DbContext, ScopeContext } from '#/core/context';
import { AppError } from '#/core/error';
import { checkPreconditions, type PreconditionContext } from '#/core/preconditions';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { type AccessContext, accessFrom } from '#/permissions/access';
import { type ArchiveContext, assertNotArchived } from '#/permissions/archive';
import { draftChannelVisibleTo } from '#/permissions/channel-collection-scope';
import type { EntityModel } from '#/tables';

/** `membership` is the grant that allowed the action: a membership row for a user, a stored binding for a service. */
export interface ValidChannelResult<T extends ChannelEntityType, G extends ActorBinding = ActorBinding> {
  entity: EntityModel<T>;
  membership: G | null;
}

/**
 * Whether a row matches every id of the request scope: the single and the batch reads (`splitByPermission`) refuse the
 * same rows. Cross-tenant routes set no scope and the organization row carries no organizationId, so only ids present
 * on both sides are compared.
 */
export const inRequestScope = (ctx: ScopeContext, row: { tenantId: string; organizationId?: string | null }): boolean => {
  const { tenantId, organizationId } = ctx.var;
  if (tenantId && row.tenantId !== tenantId) return false;
  if (organizationId && 'organizationId' in row && row.organizationId !== organizationId) return false;
  return true;
};

/** How a channel is looked up: by slug in place of its id, and locked until the caller's transaction ends, `forUpdate` to write it or `forShare` to hold its `public`. */
type ChannelLookup = { bySlug?: boolean; forUpdate?: boolean; forShare?: boolean };

/**
 * Looks a channel entity up by ID (or slug when `bySlug`) inside the request scope; throws 404 when
 * it is missing or belongs to another tenant or organization. No permission check: the caller's own
 * action check authorizes (the create check on the row being placed, a collection read filter), so
 * never hand the row to a client from here. Channel tables sit outside RLS, so this comparison is
 * their tenant isolation.
 */
export const resolveChannelInScope = async <T extends ChannelEntityType>(
  ctx: DbContext & ScopeContext,
  entityId: string,
  entityType: T,
  { bySlug = false, forUpdate = false, forShare = false }: ChannelLookup = {},
): Promise<EntityModel<T>> => {
  const entity = await resolveEntity(ctx, { entityType, identifier: entityId, bySlug, forUpdate, forShare });

  // Missing and out-of-scope rows read as the same 404.
  if (!entity || !inRequestScope(ctx, entity)) throw new AppError(404, 'not_found', 'warn', { entityType });

  return entity;
};

/**
 * Checks whether the user may perform `action` on a channel entity, resolved by ID (or slug when `bySlug`). A draft
 * reads as missing to a caller the lists hide it from (`draftChannelVisibleTo`), whatever the action.
 * `membership` may be `null` while allowed: system admins and admins of a higher-level entity pass without one. An
 * update that merges its change with the stored row reads it `forUpdate`, in the transaction of its write, so two
 * overlapping merges cannot each start from the row the other replaces. `ignoreArchive` skips the archive check: for
 * the archive route, which must reach an archived channel to reopen it, and for withdrawing an invitation, which
 * removes a row as removing a member does.
 * @throws AppError 404 when the channel is not found or the caller may not read it.
 * @throws AppError 403 `channel_archived` when the channel is archived and `action` is no read or delete.
 * @throws AppError 403 `forbidden` when the caller reads the channel but may not perform `action`.
 */
export const getValidChannel = async <T extends ChannelEntityType>(
  ctx: DbContext & ScopeContext & AccessContext & PreconditionContext & ArchiveContext,
  entityId: string,
  entityType: T,
  action: Exclude<EntityActionType, 'create'>,
  { ignoreArchive = false, ...lookup }: ChannelLookup & { ignoreArchive?: boolean } = {},
): Promise<ValidChannelResult<T>> => {
  const entity = await resolveChannelInScope(ctx, entityId, entityType, lookup);

  const subject = buildSubjectFromEntity(entityType, entity);
  const access = accessFrom(ctx);
  const read = checkAccess(access, 'read', subject);
  // A context without an actor (a public route) is a visitor here, as it is to `accessFrom`: it holds no grant.
  const readsAsMissing = !read.allowed || !draftChannelVisibleTo(entityType, entity, access);
  if (readsAsMissing) throw new AppError(404, 'not_found', 'warn', { entityType });
  if (!ignoreArchive) assertNotArchived(ctx, action, subject);

  const { allowed, membership } = action === 'read' ? read : checkAccess(access, action, subject);
  if (!allowed) throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { action } });
  checkPreconditions(ctx, entityType, entity);

  return { entity, membership };
};
