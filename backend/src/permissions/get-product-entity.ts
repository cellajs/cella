import type { EntityActionType, ProductEntityType } from 'shared';
import { baseDb } from '#/db/db';
import { tenantRead } from '#/db/tenant-context';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { type EntityModel, resolveEntity } from '#/modules/entities/helpers/resolve-entity';
import { checkPermission } from '#/permissions';

/**
 * Result type for product entity validation including the can object.
 */
export interface ValidProductEntityResult<K extends ProductEntityType> {
  entity: EntityModel<K>;
}

/**
 * Checks if current user has permission to perform a given action on a product entity.
 *
 * Resolves product entity based on provided type and ID/slug, and verifies user permissions
 * (including system admin overrides).
 *
 * Returns resolved product entity and a `can` object with all action permissions.
 * Throws an error if entity cannot be found or user lacks required permissions.
 *
 * @param ctx - Hono context (for memberships, user info)
 * @param id - Product's unique ID.
 * @param entityType - Type of product entity.
 * @param action - The action to check (e.g., `"read" | "update" | "delete"`).
 * @param db - Database connection or transaction (e.g., from tenantRead).
 * @returns An object containing resolved entity and can object.
 */
export const getValidProductEntity = async <K extends ProductEntityType>(
  ctx: {
    var: Pick<Env['Variables'], 'db' | 'userId' | 'isSystemAdmin' | 'memberships' | 'tenantId' | 'user'> & {
      organizationId?: string;
    };
  },
  id: string,
  entityType: K,
  action: Exclude<EntityActionType, 'create'>,
): Promise<ValidProductEntityResult<K>> => {
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const memberships = ctx.var.memberships;
  const userId = ctx.var.userId;

  // Auto-wrap in tenantRead when called outside an RLS context (bare baseDb)
  const entity =
    ctx.var.db === baseDb
      ? await tenantRead(ctx, (readCtx) => resolveEntity(readCtx.var.db, entityType, id))
      : await resolveEntity(ctx.var.db, entityType, id);
  if (!entity) throw new AppError(404, 'not_found', 'warn', { entityType });

  // Step 2: Check permission for the requested action.
  const { isAllowed } = checkPermission(memberships, action, entity, { isSystemAdmin, userId });

  if (!isAllowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { action } });
  }

  if (
    ctx.var.organizationId &&
    typeof entity === 'object' &&
    entity !== null &&
    'organizationId' in entity &&
    entity.organizationId !== ctx.var.organizationId
  ) {
    throw new AppError(404, 'not_found', 'warn', { entityType });
  }

  return { entity };
};
