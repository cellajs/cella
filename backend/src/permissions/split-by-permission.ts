import type { ChannelEntityIdColumns, ChannelEntityType, EntityActionType, ProductEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { tenantRead } from '#/db/tenant-context';
import { resolveEntities } from '#/modules/entities/entities-queries';
import { checkPermission } from '#/permissions';
import { actorFrom } from '#/permissions/actor';
import { buildSubjectFromEntity } from '#/permissions/build-subject';

/**
 * Splits entity IDs into allowed and disallowed based on the user's permissions.
 *
 * Resolves the entities and checks whether the user can perform the specified action.
 * The result is split into `allowedIds` and `rejectedIds`.
 * Throws 403 if none of the requested IDs are allowed.
 *
 * @param action - Action to check `"create" | "read" | "update" | "delete"`.
 * @param entityType - The type of entity (context or product, not user).
 * @param ids - The entity IDs to check.
 * @returns An object with `allowedIds` and `rejectedIds` arrays.
 * @throws {AppError} 403 if no entities are allowed.
 */
export const splitByPermission = async (
  ctx: AuthContext,
  action: EntityActionType,
  entityType: ChannelEntityType | ProductEntityType,
  ids: string[],
) => {
  const memberships = ctx.var.memberships;

  // Resolve entities (includes createdBy for implicit owner relation)
  // Auto-wrap in tenantRead when called outside an RLS context (bare baseDb)
  const entities =
    ctx.var.db === baseDb
      ? await tenantRead(ctx, (readCtx) => resolveEntities(readCtx, entityType, ids))
      : await resolveEntities(ctx, entityType, ids);

  // Check permissions for all entities in a single batch operation. Each entity doubles as
  // `row`, so row conditions and public read grants evaluate from real row data.
  const subjects = entities.map((entity) =>
    buildSubjectFromEntity(
      entityType,
      entity as { id: string; createdBy?: string | null } & Partial<ChannelEntityIdColumns>,
    ),
  );
  const { results } = checkPermission(memberships, action, subjects, actorFrom(ctx));

  // Partition into allowed and disallowed
  const allowedIds: string[] = [];
  const rejectedIds: string[] = [];

  for (const entity of entities) {
    const result = results.get(entity.id);
    if (result?.isAllowed) {
      allowedIds.push(entity.id);
    } else {
      rejectedIds.push(entity.id);
    }
  }

  // Throw if user has no permission for any of the requested entities
  if (!allowedIds.length) throw new AppError(403, 'forbidden', 'warn', { entityType });

  return { allowedIds, rejectedIds };
};
