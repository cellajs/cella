import type { Context } from 'hono';
import type { EntityActionType } from 'shared';
import { nanoid } from 'shared/nanoid';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { checkPermission } from '#/permissions';
import type { SubjectForPermission } from '#/permissions/permission-manager/types';

/**
 * Checks if user has permission to perform a collection-level action on an entity type.
 * Use for list/collection endpoints where no specific entity exists yet (e.g., getAttachments).
 *
 * For single-entity checks, use `getValidProductEntity` or `getValidContextEntity` instead.
 * For create checks, use `canCreateEntity`.
 *
 * @param action - The action to check (e.g., `"read"`)
 * @param entity - Subject with entityType and context IDs (e.g., `{ entityType: 'attachment', organizationId }`)
 * @throws AppError 403 if user lacks permission
 */
export const canAccessEntity = (
  ctx: Context<Env>,
  action: Exclude<EntityActionType, 'create'>,
  entity: SubjectForPermission,
) => {
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const memberships = ctx.var.memberships;

  const { entityType } = entity;

  // Build a minimal subject for permission check (generate temp id for policy resolution)
  const subject = { ...entity, id: nanoid() };

  const { isAllowed } = checkPermission(memberships, action, subject, { isSystemAdmin });

  if (!isAllowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { action } });
  }
};
