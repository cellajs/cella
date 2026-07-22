import { draftVisibleTo, type EntityActionType, type ProductEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { tenantRead } from '#/db/tenant-context';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { checkAccess } from '#/permissions';
import { accessFrom } from '#/permissions/actor';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import type { EntityModel } from '#/tables';

/**
 * Result type for product entity validation including the can object.
 */
export interface ValidProductResult<K extends ProductEntityType> {
  entity: EntityModel<K>;
}

/**
 * Checks whether the current user may perform `action` on a product entity, resolving it by `id`
 * (system-admin bypass handled inside `checkPermission`). Returns the resolved entity; throws 404 if
 * not found, 403 if not allowed.
 */
export const getValidProduct = async <K extends ProductEntityType>(
  ctx: AuthContext,
  id: string,
  entityType: K,
  action: Exclude<EntityActionType, 'create'>,
): Promise<ValidProductResult<K>> => {
  // Auto-wrap in tenantRead when called outside an RLS context (bare baseDb)
  // Skip tenantRead for tenant-less entities (e.g. pages) where tenantId is not set
  const entity =
    ctx.var.db === baseDb && ctx.var.tenantId
      ? await tenantRead(ctx, (readCtx) => resolveEntity(readCtx, entityType, id))
      : await resolveEntity(ctx, entityType, id);
  if (!entity) throw new AppError(404, 'not_found', 'warn', { entityType });

  // Unpublished drafts (publishedAt null) read as absent to everyone but their author.
  // same 404 shape as a soft-deleted row, so a draft's existence is never revealed.
  if (!draftVisibleTo(entity as Record<string, unknown>, ctx.var.userId)) {
    throw new AppError(404, 'not_found', 'warn', { entityType });
  }

  // Step 2: Check permission for the requested action. The entity doubles as `row`, so
  // 'own' row conditions and public read grants evaluate from real row data.
  const subject = buildSubjectFromEntity(entityType, entity);
  const { isAllowed } = checkAccess(accessFrom(ctx), action, subject);

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
