import type { DbContext } from '#/core/context';
import { toUserMinimalBase, type UserMinimalBase, type WithAuditUsers } from '#/modules/user/helpers/audit-user';
import { findAuditUsersByIds } from '#/modules/user/user-queries';

type KnownUsersInput = Map<string, UserMinimalBase> | { id: string; name: string; slug: string; thumbnailUrl: string | null };

/**
 * Populates createdBy/updatedBy string IDs with UserMinimalBase objects. The columns hold any actor id; a
 * service account resolves to `null` here until responses carry a second actor kind (substrate Phase C).
 */
export async function withAuditUsers<T extends { createdBy: string | null; updatedBy?: string | null }>(
  ctx: DbContext,
  entities: T[],
  knownUsersInput?: KnownUsersInput,
): Promise<WithAuditUsers<T>[]> {
  const knownUsers = !knownUsersInput
    ? new Map<string, UserMinimalBase>()
    : knownUsersInput instanceof Map
      ? knownUsersInput
      : new Map([[knownUsersInput.id, toUserMinimalBase(knownUsersInput)]]);

  const unknownIds = new Set<string>();
  for (const entity of entities) {
    if (entity.createdBy && !knownUsers.has(entity.createdBy)) unknownIds.add(entity.createdBy);
    if (entity.updatedBy && !knownUsers.has(entity.updatedBy)) unknownIds.add(entity.updatedBy);
  }

  if (unknownIds.size > 0) {
    const users = await findAuditUsersByIds(ctx, { ids: [...unknownIds] });

    for (const user of users) {
      knownUsers.set(user.id, { ...user, entityType: 'user' as const });
    }
  }

  return entities.map(({ createdBy, updatedBy = null, ...rest }) => ({
    ...(rest as Omit<T, 'createdBy' | 'updatedBy'>),
    createdBy: createdBy ? (knownUsers.get(createdBy) ?? null) : null,
    updatedBy: updatedBy ? (knownUsers.get(updatedBy) ?? null) : null,
  }));
}

/** Single-entity wrapper around withAuditUsers. */
export async function withAuditUser<T extends { createdBy: string | null; updatedBy?: string | null }>(
  ctx: DbContext,
  entity: T,
  knownUsersInput?: KnownUsersInput,
) {
  const [result] = await withAuditUsers(ctx, [entity], knownUsersInput);
  return result;
}
