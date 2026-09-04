import type { ChannelEntityType, EntityActionType } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { resolveEntity } from '#/modules/entities/entities-queries';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { checkAccess } from '#/permissions';
import { accessFrom } from '#/permissions/access';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import type { EntityModel } from '#/tables';

export interface ValidChannelResult<T extends ChannelEntityType> {
  entity: EntityModel<T>;
  membership: MembershipBaseModel | null;
}

/**
 * Checks whether the user may perform `action` on a channel entity, resolved by ID (or slug when
 * `bySlug`); throws 404 if not found, 403 if not allowed. `membership` may be `null` while allowed:
 * system admins and admins of a higher-level entity (`permissions-config`) pass without one.
 * Channel tables sit outside RLS, so the request-scope comparison here is their tenant isolation.
 * @param ctx - Context with memberships and isSystemAdmin set by the guard chain.
 */
export const getValidChannel = async <T extends ChannelEntityType>(
  ctx: AuthContext,
  entityId: string,
  entityType: T,
  action: Exclude<EntityActionType, 'create'>,
  bySlug = false,
): Promise<ValidChannelResult<T>> => {
  const entity = await resolveEntity(ctx, { entityType, identifier: entityId, bySlug });

  // Cross-tenant routes set no scope and the organization row carries no organizationId, so only ids
  // present on both sides are compared. Missing and out-of-scope rows read as the same 404.
  const { tenantId, organizationId } = ctx.var;
  const inScope =
    !!entity &&
    (!tenantId || entity.tenantId === tenantId) &&
    (!organizationId || !('organizationId' in entity) || entity.organizationId === organizationId);
  if (!entity || !inScope) throw new AppError(404, 'not_found', 'warn', { entityType });

  // System admin bypass is handled inside checkAccess.
  const subject = buildSubjectFromEntity(entityType, entity);
  const { allowed, membership } = checkAccess(accessFrom(ctx), action, subject);
  if (!allowed) throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { action } });

  return { entity, membership };
};
