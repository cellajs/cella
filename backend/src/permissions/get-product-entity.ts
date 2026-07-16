import type { EntityActionType, ProductEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { tenantRead } from '#/db/tenant-context';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { checkPermission } from '#/permissions';
import { actorFrom } from '#/permissions/actor';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import type { EntityModel } from '#/tables';

/**
 * Result type for product entity validation including the can object.
 */
export interface ValidProductEntityResult<K extends ProductEntityType> {
  entity: EntityModel<K>;
}

/**
 * Checks whether the current user may perform `action` on a product entity, resolving it by `id`
 * (system-admin bypass handled inside `checkPermission`). Returns the resolved entity; throws 404 if
 * not found, 403 if not allowed.
 */
export const getValidProductEntity = async <K extends ProductEntityType>(
  ctx: AuthContext,
  id: string,
  entityType: K,
  action: Exclude<EntityActionType, 'create'>,
): Promise<ValidProductEntityResult<K>> => {
  const memberships = ctx.var.memberships;

  // Auto-wrap in tenantRead when called outside an RLS context (bare baseDb)
  // Skip tenantRead for tenant-less entities (e.g. pages) where tenantId is not set
  const entity =
    ctx.var.db === baseDb && ctx.var.tenantId
      ? await tenantRead(ctx, (readCtx) => resolveEntity(readCtx, entityType, id))
      : await resolveEntity(ctx, entityType, id);
  if (!entity) throw new AppError(404, 'not_found', 'warn', { entityType });

  // Step 2: Check permission for the requested action. The entity doubles as `row`, so
  // 'own' row conditions and public read grants evaluate from real row data.
  const subject = buildSubjectFromEntity(entityType, entity);
  const { isAllowed } = checkPermission(memberships, action, subject, actorFrom(ctx));

  if (!isAllowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { action } });
  }

  if (
    ctx.var.organizationId &&
    typeof entity === 'object' &&
    'organizationId' in entity &&
    entity.organizationId !== ctx.var.organizationId
  ) {
    throw new AppError(404, 'not_found', 'warn', { entityType });
  }

  return { entity };
};
