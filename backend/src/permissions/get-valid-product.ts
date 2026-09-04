import { draftVisibleTo, type EntityActionType, type ProductEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { tenantRead } from '#/db/tenant-context';
import { requestScope } from '#/db/utils/request-scope';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { checkAccess } from '#/permissions';
import { accessFrom } from '#/permissions/access';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import type { EntityModel } from '#/tables';

export interface ValidProductResult<K extends ProductEntityType> {
  entity: EntityModel<K>;
}

/**
 * Checks whether the user may perform `action` on a product entity resolved by `id`; throws 404
 * if not found, 403 if not allowed. Every product carries `tenantId` and `organizationId`, and the
 * row must match the request scope set by the guard chain, so the answer is the same with RLS
 * bypassed. System-admin bypass sits inside `checkAccess` and never widens that scope.
 */
export const getValidProduct = async <K extends ProductEntityType>(
  ctx: AuthContext,
  id: string,
  entityType: K,
  action: Exclude<EntityActionType, 'create'>,
): Promise<ValidProductResult<K>> => {
  // Product routes run behind tenantGuard + orgGuard; a route wired without them is a bug, not a request error.
  const { tenantId, organizationId } = requestScope(ctx, entityType);

  // Bare baseDb carries no RLS session context, so the read runs inside a tenant transaction.
  const entity =
    ctx.var.db === baseDb
      ? await tenantRead(ctx, (readCtx) => resolveEntity(readCtx, { entityType, identifier: id }))
      : await resolveEntity(ctx, { entityType, identifier: id });

  // Missing, soft-deleted, foreign-tenant, foreign-organization and invisible-draft rows all read
  // as the same 404, so a row's existence is never revealed outside its scope.
  if (!entity || entity.tenantId !== tenantId || entity.organizationId !== organizationId) {
    throw new AppError(404, 'not_found', 'warn', { entityType });
  }
  if (!draftVisibleTo(entity as Record<string, unknown>, ctx.var.userId)) {
    throw new AppError(404, 'not_found', 'warn', { entityType });
  }

  // The entity doubles as `row`, so 'own' row conditions and public read grants evaluate from real row data.
  const subject = buildSubjectFromEntity(entityType, entity);
  const { allowed } = checkAccess(accessFrom(ctx), action, subject);
  if (!allowed) throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { action } });

  return { entity };
};
