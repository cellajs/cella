import type { ContextEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { deleteMyMembership } from '#/modules/me/me-queries';
import { logEvent } from '#/utils/logger';

export async function deleteMyMembershipOp(ctx: AuthContext, entityType: ContextEntityType, entityId: string) {
  const user = ctx.var.user;

  const entity = await resolveEntity(ctx, entityType, entityId);
  if (!entity) throw new AppError(404, 'not_found', 'warn', { entityType });

  await deleteMyMembership({ var: { ...ctx.var, db: baseDb } }, { contextId: entity.id });

  invalidateCache.user(user.id);
  logEvent(ctx, 'info', 'User left entity');
}
