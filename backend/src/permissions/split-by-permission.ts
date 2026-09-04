import type { ChannelEntityType, ChannelIdColumns, EntityActionType, ProductEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { tenantRead } from '#/db/tenant-context';
import { resolveEntities } from '#/modules/entities/entities-queries';
import { checkAccessBatch } from '#/permissions';
import { accessFrom } from '#/permissions/access';
import { buildSubjectFromEntity } from '#/permissions/build-subject';

type ScopedRow = { id: string; tenantId?: string; organizationId?: string | null };

/** A row is in scope when it matches every id the guard chain set; the organization row itself carries no `organizationId`. */
const inRequestScope = (ctx: AuthContext, row: ScopedRow): boolean => {
  const { tenantId, organizationId } = ctx.var;
  if (tenantId && 'tenantId' in row && row.tenantId !== tenantId) return false;
  if (organizationId && 'organizationId' in row && row.organizationId !== organizationId) return false;
  return true;
};

/**
 * Resolves `ids` and splits them into `allowedIds` / `rejectedIds` by whether the user may `action`.
 * Ids that do not resolve, or resolve outside the request's tenant or organization, are rejected
 * before the permission batch runs, so a bulk call never acts on a foreign row and never reveals
 * whether it exists.
 * @param entityType - The type of entity (channel or product, not user).
 * @throws {AppError} 403 if no entities are allowed.
 */
export const splitByPermission = async (
  ctx: AuthContext,
  action: EntityActionType,
  entityType: ChannelEntityType | ProductEntityType,
  ids: string[],
) => {
  // Resolve entities (createdBy included for the owner relation); auto-wrap in tenantRead outside an RLS context.
  const resolved =
    ctx.var.db === baseDb
      ? await tenantRead(ctx, (readCtx) => resolveEntities(readCtx, { entityType, ids }))
      : await resolveEntities(ctx, { entityType, ids });
  const entities = resolved.filter((entity) => inRequestScope(ctx, entity as ScopedRow));
  const candidateIds = new Set(entities.map((entity) => entity.id));

  // Each entity doubles as `row`, so row conditions and public read grants evaluate from real row data.
  const subjects = entities.map((entity) =>
    buildSubjectFromEntity(entityType, entity as { id: string; createdBy?: string | null } & Partial<ChannelIdColumns>),
  );
  const { results } = checkAccessBatch(accessFrom(ctx), action, subjects);

  const allowedIds: string[] = [];
  const rejectedIds: string[] = ids.filter((id) => !candidateIds.has(id));

  for (const entity of entities) {
    const result = results.get(entity.id);
    if (result?.allowed) {
      allowedIds.push(entity.id);
    } else {
      rejectedIds.push(entity.id);
    }
  }

  if (!allowedIds.length) throw new AppError(403, 'forbidden', 'warn', { entityType });

  return { allowedIds, rejectedIds };
};
