import type { ChannelEntityType, EntityActionType } from 'shared';
import type { ActorBinding, ActorContext, DbContext, Env } from '#/core/context';
import { AppError } from '#/core/error';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { checkAccess } from '#/permissions';
import { accessFrom, actorFrom, type BindingOf } from '#/permissions/access';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { draftChannelVisibleTo } from '#/permissions/channel-collection-scope';
import type { EntityModel } from '#/tables';

/** `membership` is the grant that allowed the action: a membership row for a user, a stored binding for a service. */
export interface ValidChannelResult<T extends ChannelEntityType, G extends ActorBinding = ActorBinding> {
  entity: EntityModel<T>;
  membership: G | null;
}

/** The request scope the guard chain set; cross-tenant routes set none. */
type ScopeContext = { var: Partial<Pick<Env['Variables'], 'tenantId' | 'organizationId'>> };

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
  bySlug = false,
): Promise<EntityModel<T>> => {
  const entity = await resolveEntity(ctx, { entityType, identifier: entityId, bySlug });

  // Missing and out-of-scope rows read as the same 404.
  if (!entity || !inRequestScope(ctx, entity)) throw new AppError(404, 'not_found', 'warn', { entityType });

  return entity;
};

/**
 * Checks whether the user may perform `action` on a channel entity, resolved by ID (or slug when
 * `bySlug`); throws 404 when it is not found or the caller may not read it, 403 when the caller
 * reads it but may not perform `action` (the refusal rules in PERMISSIONS.md). A draft reads as
 * missing to a caller the lists hide it from (`draftChannelVisibleTo`), whatever the action.
 * `membership` may be `null` while allowed: system admins and admins of a higher-level entity
 * (`permissions-config`) pass without one.
 * @param ctx - Context with memberships and isSystemAdmin set by the guard chain.
 */
export const getValidChannel = async <T extends ChannelEntityType, C extends ActorContext>(
  ctx: C,
  entityId: string,
  entityType: T,
  action: Exclude<EntityActionType, 'create'>,
  bySlug = false,
): Promise<ValidChannelResult<T, BindingOf<C>>> => {
  const entity = await resolveChannelInScope(ctx, entityId, entityType, bySlug);

  // System admin bypass is handled inside checkAccess.
  const subject = buildSubjectFromEntity(entityType, entity);
  const access = accessFrom(ctx);
  const read = checkAccess(access, 'read', subject);
  // A context without an actor (a public route) is anonymous here, as it is to `accessFrom`: it holds no grant.
  if (!read.allowed || !draftChannelVisibleTo(entityType, entity, ctx.var.actor?.bindings ?? [], actorFrom(ctx))) {
    throw new AppError(404, 'not_found', 'warn', { entityType });
  }

  const { allowed, membership } = action === 'read' ? read : checkAccess(access, action, subject);
  if (!allowed) throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { action } });

  return { entity, membership };
};
