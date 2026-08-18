import { getColumns, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import type { DbOrTx } from '#/db/db';
import { usersTable } from '#/modules/user/user-db';
import { userMinimalBaseSchema } from '#/schemas/minimal-base';
import { pick } from '#/utils/pick';

export type UserMinimalBase = z.infer<typeof userMinimalBaseSchema>;

export const createdByUser = alias(usersTable, 'created_by_user');
export const updatedByUser = alias(usersTable, 'updated_by_user');

// Minimal-user columns minus entityType (added as a SQL literal); derived so this tracks userMinimalBaseSchema.
type AuditUserColumnKey = Exclude<keyof typeof userMinimalBaseSchema.shape, 'entityType'>;
const selectKeys = (Object.keys(userMinimalBaseSchema.shape) as (keyof typeof userMinimalBaseSchema.shape)[]).filter(
  (key): key is AuditUserColumnKey => key !== 'entityType',
);

/** entityType is a SQL literal 'user' to preserve the literal type. */
const buildAuditUserSelect = (aliasedTable: typeof createdByUser | typeof updatedByUser) => ({
  ...pick(getColumns(aliasedTable), selectKeys),
  entityType: sql<'user'>`'user'`,
});

export const auditUserSelect = {
  createdBy: buildAuditUserSelect(createdByUser),
  updatedBy: buildAuditUserSelect(updatedByUser),
};

/** Accepts both nullable (LEFT JOIN) and non-nullable shapes for audit user fields. */
type LooseAuditUser = { [K in keyof UserMinimalBase]: UserMinimalBase[K] | null };
type RawAuditRow = { createdBy: LooseAuditUser; updatedBy: LooseAuditUser };

/** Entity with audit user fields resolved to full objects (or null). */
type WithAuditUsers<T> = Omit<T, 'createdBy' | 'updatedBy'> & {
  createdBy: UserMinimalBase | null;
  updatedBy: UserMinimalBase | null;
};

export function coalesceAuditUsers<T extends RawAuditRow>(rows: T[]): WithAuditUsers<T>[] {
  return rows.map(({ createdBy, updatedBy, ...rest }) => ({
    ...(rest as Omit<T, 'createdBy' | 'updatedBy'>),
    createdBy: createdBy?.id ? (createdBy as UserMinimalBase) : null,
    updatedBy: updatedBy?.id ? (updatedBy as UserMinimalBase) : null,
  }));
}

export const toUserMinimalBase = (
  user: Pick<UserMinimalBase, 'id' | 'name' | 'slug' | 'thumbnailUrl'>,
): UserMinimalBase => ({
  ...user,
  entityType: 'user',
});

type KnownUsersInput =
  | Map<string, UserMinimalBase>
  | { id: string; name: string; slug: string; thumbnailUrl: string | null };

/** Populates createdBy/updatedBy string IDs with UserMinimalBase objects. */
export async function withAuditUsers<T extends { createdBy: string | null; updatedBy?: string | null }>(
  { var: { db } }: { var: { db: DbOrTx } },
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
    // biome-ignore lint/suspicious/noExplicitAny: drizzle-orm union-table inference fails with DbOrTx (issue #4367).
    const users = await (db as any)
      .select(pick(getColumns(usersTable), selectKeys))
      .from(usersTable)
      .where(inArray(usersTable.id, [...unknownIds]));

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
  ctx: { var: { db: DbOrTx } },
  entity: T,
  knownUsersInput?: KnownUsersInput,
) {
  const [result] = await withAuditUsers(ctx, [entity], knownUsersInput);
  return result;
}

/** Audit-user hydration without DB queries: the current user becomes updatedBy and createdBy is stubbed null. */
export function withAuditUserLite<T extends { createdBy: string | null; updatedBy?: string | null }>(
  entity: T,
  currentUser: Pick<UserMinimalBase, 'id' | 'name' | 'slug' | 'thumbnailUrl'>,
): WithAuditUsers<T> {
  return {
    ...(entity as Omit<T, 'createdBy' | 'updatedBy'>),
    createdBy: null,
    updatedBy: toUserMinimalBase(currentUser),
  } as WithAuditUsers<T>;
}
