import type { ChannelEntityType, EntityActionType } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { type EntityModel, resolveEntity } from '#/modules/entities/entities-queries';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { checkPermission } from '#/permissions';
import { actorFrom } from '#/permissions/actor';
import { buildSubjectFromEntity } from '#/permissions/build-subject';

/**
 * Result type for channel entity validation including the can object.
 */
export interface ValidChannelEntityResult<T extends ChannelEntityType> {
  entity: EntityModel<T>;
  membership: MembershipBaseModel | null;
}

/**
 * Checks whether the current user may perform `action` on a channel entity, resolving it by ID (or
 * slug when `bySlug`). Returns the entity plus the user's membership; throws 404 if not found, 403
 * if not allowed.
 *
 * `membership` may be `null` even when allowed — the user is a system admin, or an admin of a
 * higher-level entity as defined in `permissions-config`.
 *
 * @param ctx - Context with memberships and isSystemAdmin set by the guard chain.
 */
export const getValidChannelEntity = async <T extends ChannelEntityType>(
  ctx: AuthContext,
  entityId: string,
  entityType: T,
  action: Exclude<EntityActionType, 'create'>,
  bySlug = false,
): Promise<ValidChannelEntityResult<T>> => {
  const memberships = ctx.var.memberships;

  // Step 1: Resolve target entity by ID (or slug when bySlug is true)
  const entity = await resolveEntity(ctx, entityType, entityId, bySlug);
  if (!entity) throw new AppError(404, 'not_found', 'warn', { entityType });

  // Step 2: Check permission for the requested action (system admin bypass is handled inside)
  const subject = buildSubjectFromEntity(entityType, entity);
  const { isAllowed, membership } = checkPermission(memberships, action, subject, actorFrom(ctx));

  if (!isAllowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { action } });
  }

  return { entity, membership };
};
