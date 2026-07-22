import type { ChannelEntityType, ChannelIdColumns, EntityActionType, ProductEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { tenantRead } from '#/db/tenant-context';
import { resolveEntities } from '#/modules/entities/entities-queries';
import { checkAccessBatch } from '#/permissions';
import { accessFrom } from '#/permissions/actor';
import { buildSubjectFromEntity } from '#/permissions/build-subject';

/**
 * Resolves `ids` and splits them into `allowedIds` / `rejectedIds` by whether the user may perform
 * `action`.
 *
 * @param entityType - The type of entity (context or product, not user).
 * @throws {AppError} 403 if no entities are allowed.
 */
export const splitByPermission = async (
  ctx: AuthContext,
  action: EntityActionType,
  entityType: ChannelEntityType | ProductEntityType,
  ids: string[],
) => {
  // Resolve entities (includes createdBy for implicit owner relation)
  // Auto-wrap in tenantRead when called outside an RLS context (bare baseDb)
  const entities =
    ctx.var.db === baseDb
      ? await tenantRead(ctx, (readCtx) => resolveEntities(readCtx, entityType, ids))
      : await resolveEntities(ctx, entityType, ids);

  // Check permissions for all entities in a single batch operation. Each entity doubles as
  // `row`, so row conditions and public read grants evaluate from real row data.
  const subjects = entities.map((entity) =>
    buildSubjectFromEntity(entityType, entity as { id: string; createdBy?: string | null } & Partial<ChannelIdColumns>),
  );
  const { results } = checkAccessBatch(accessFrom(ctx), action, subjects);

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
