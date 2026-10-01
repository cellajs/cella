import type { ChannelEntityType } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { deleteMyMembership } from '#/modules/me/me-queries';
import { log } from '#/utils/logger';

export async function deleteMyMembershipOp(ctx: UserContext, entityType: ChannelEntityType, entityId: string) {
  const entity = await resolveEntity(ctx, { entityType, identifier: entityId });
  if (!entity) throw new AppError(404, 'not_found', 'warn', { entityType });

  await deleteMyMembership({ var: { ...ctx.var, db: baseDb } }, { channelId: entity.id });
  log.info('User left entity');
}
