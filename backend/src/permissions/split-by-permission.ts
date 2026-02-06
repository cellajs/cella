import type { Context } from 'hono';
import type { ContextEntityType, EntityActionType, ProductEntityType } from 'shared';
import type { Env } from '#/lib/context';
import { resolveEntities } from '#/lib/resolve-entity';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { checkPermission } from '#/permissions';

/**
 * Splits entity IDs into allowed and disallowed based on the user's permissions.
 *
 * Resolves the entities and checks whether the user can perform the specified action.
 * The result is split into `allowedIds` and `disallowedIds`.
 * Note: Only context and product entities are supported - user access uses separate logic.
 *
 * @param action - Action to check `"create" | "read" | "update" | "delete"`.
 * @param entityType - The type of entity (context or product, not user).
 * @param ids - The entity IDs to check.
 * @param memberships - The user's memberships.
 * @returns An object with `allowedIds` and `disallowedIds` arrays.
 */
export const splitByPermission = async (
  ctx: Context<Env>,
  action: EntityActionType,
  entityType: ContextEntityType | ProductEntityType,
  ids: string[],
  memberships: MembershipBaseModel[],
) => {
  const userSystemRole = ctx.var.userRole;

  // Resolve entities
  const entities = await resolveEntities(entityType, ids);

  // Check permissions for all entities in a single batch operation
  const { results } = checkPermission(memberships, action, entities, { systemRole: userSystemRole });

  // Partition into allowed and disallowed
  const allowedIds: string[] = [];
  const disallowedIds: string[] = [];

  for (const entity of entities) {
    const result = results.get(entity.id);
    if (result?.isAllowed) {
      allowedIds.push(entity.id);
    } else {
      disallowedIds.push(entity.id);
    }
  }

  return { allowedIds, disallowedIds };
};
