import type { ChannelEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { deleteMyMembership } from '#/modules/me/me-queries';
import { log } from '#/utils/logger';

export async function deleteMyMembershipOp(ctx: AuthContext, entityType: ChannelEntityType, entityId: string) {
  const user = ctx.var.user;

  const entity = await resolveEntity(ctx, entityType, entityId);
  if (!entity) throw new AppError(404, 'not_found', 'warn', { entityType });

  await deleteMyMembership({ var: { ...ctx.var, db: baseDb } }, { channelId: entity.id });

  invalidateCache.user(user.id);
  log.info('User left entity');
}
