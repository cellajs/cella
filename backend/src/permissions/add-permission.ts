import type { Context } from 'hono';
import type { EntityActionType } from 'shared';
import type { Env } from '#/lib/context';
import type { PermissionResult } from './check-permission';
import { checkPermission } from './check-permission';
import type { SubjectForPermission } from './permission-manager';

/** Entity enriched with permission can object */
export type WithAllowance<T> = T & {
  can: PermissionResult['can'];
};

/**
 * Enriches entities with permission `can` object based on user's memberships.
 * Uses context memberships and system role from async local storage.
 *
 * @param action - The action to check (used for logging/debugging, all actions are computed)
 * @param entities - Array of entities to enrich
 * @returns Entities with `can` object added
 */
export const addPermission = <T extends SubjectForPermission>(
  ctx: Context<Env>,
  action: EntityActionType,
  entities: T[],
): WithAllowance<T>[] => {
  const memberships = ctx.var.memberships;
  const userSystemRole = ctx.var.userRole;

  const { results } = checkPermission(memberships, action, entities, {
    systemRole: userSystemRole,
  });

  return entities.map((entity) => {
    const permResult = results.get(entity.id);
    if (!permResult) {
      throw new Error(`Permission result not found for entity ${entity.id}`);
    }
    return {
      ...entity,
      can: permResult.can,
    };
  });
};
