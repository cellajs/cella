import type { ChannelEntityType, EntityActionType } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { resolveEntity } from '#/modules/entities/entities-queries';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { checkAccess } from '#/permissions';
import { accessFrom } from '#/permissions/actor';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import type { EntityModel } from '#/tables';

/**
 * Result type for channel entity validation including the can object.
 */
export interface ValidChannelResult<T extends ChannelEntityType> {
  entity: EntityModel<T>;
  membership: MembershipBaseModel | null;
}

/**
 * Checks whether the current user may perform `action` on a channel entity, resolving it by ID (or
 * slug when `bySlug`). Returns the entity plus the user's membership; throws 404 if not found, 403
 * if not allowed.
 *
 * `membership` may be `null` even when allowed if the user is a system admin or an admin of a
 * higher-level entity as defined in `permissions-config`.
 *
 * @param ctx - Context with memberships and isSystemAdmin set by the guard chain.
 */
export const getValidChannel = async <T extends ChannelEntityType>(
  ctx: AuthContext,
  entityId: string,
  entityType: T,
  action: Exclude<EntityActionType, 'create'>,
  bySlug = false,
): Promise<ValidChannelResult<T>> => {
  // Step 1: Resolve target entity by ID (or slug when bySlug is true)
  const entity = await resolveEntity(ctx, entityType, entityId, bySlug);
  if (!entity) throw new AppError(404, 'not_found', 'warn', { entityType });

  // Step 2: Check permission for the requested action (system admin bypass is handled inside)
  const subject = buildSubjectFromEntity(entityType, entity);
  const { isAllowed, membership } = checkAccess(accessFrom(ctx), action, subject);

  if (!isAllowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { action } });
  }

  return { entity, membership };
};
