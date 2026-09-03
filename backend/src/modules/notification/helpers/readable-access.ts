import type { ProductEntityType } from 'shared';
import type { NotificationSubjectRow } from '#/lib/module';
import { checkAccessFanout } from '#/permissions';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { accessForUserIds, type UserAccess } from './access-for-users';

/**
 * Access objects of the given users who may read the row, keyed by user id. Mention derivation
 * and the fan-out both need this decision, and the fan-out also reads the memberships for mute.
 * Fails closed: an unknown user drops the whole set, as a doctored id must never notify anyone.
 */
export async function readableAccess(
  entityType: ProductEntityType,
  row: NotificationSubjectRow,
  userIds: string[],
): Promise<Map<string, UserAccess>> {
  const readable = new Map<string, UserAccess>();
  if (userIds.length === 0) return readable;

  const accessByUser = await accessForUserIds(userIds);
  const accesses = userIds.map((userId) => accessByUser.get(userId)).filter((access) => access !== undefined);
  if (accesses.length !== userIds.length) return readable;

  const subject = buildSubjectFromEntity(entityType, row);
  const decisions = checkAccessFanout(accesses, 'read', subject, { onInvalidMembership: 'deny' });
  accesses.forEach((access, index) => {
    if (decisions[index]?.allowed) readable.set(access.userId, access);
  });
  return readable;
}
