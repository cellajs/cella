import { getColumns, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import type { DbOrTx } from '#/db/db';
import { usersTable } from '#/db/schema/users';
import { pickColumns } from '#/db/utils/pick-columns';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';

export type UserMinimalBase = z.infer<typeof userMinimalBaseSchema>;

// Aliases for audit user joins (createdBy / updatedBy)
export const createdByUser = alias(usersTable, 'created_by_user');
export const updatedByUser = alias(usersTable, 'updated_by_user');

// Column keys to select for audit users (entityType is added as a SQL literal)
const selectKeys = ['id', 'name', 'slug', 'thumbnailUrl'] as const;

/**
 * Build minimal user select columns from an aliased users table.
 * entityType is a SQL literal 'user' to preserve the literal type.
 */
const buildAuditUserSelect = (aliasedTable: typeof createdByUser | typeof updatedByUser) => ({
  ...pickColumns(getColumns(aliasedTable), selectKeys),
  entityType: sql<'user'>`'user'`,
});

/**
 * Pre-built audit user select shapes for LEFT JOINs.
 */
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

/**
 * Extract minimal user fields from a full user object.
 * Useful for CUD responses where the current user is known.
 */
export const toUserMinimalBase = (
  user: Pick<UserMinimalBase, 'id' | 'name' | 'slug' | 'thumbnailUrl'>,
): UserMinimalBase => ({
  ...user,
  entityType: 'user',
});

type KnownUsersInput =
  | Map<string, UserMinimalBase>
  | { id: string; name: string; slug: string; thumbnailUrl: string | null };

/**
 * Populate createdBy/updatedBy string IDs with UserMinimalBase objects.
 */
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

  // Collect all unique user IDs that need resolving
  const unknownIds = new Set<string>();
  for (const entity of entities) {
    if (entity.createdBy && !knownUsers.has(entity.createdBy)) unknownIds.add(entity.createdBy);
    if (entity.updatedBy && !knownUsers.has(entity.updatedBy)) unknownIds.add(entity.updatedBy);
  }

  // Fetch unknown users in one query
  if (unknownIds.size > 0) {
    const users = await (db as any)
      .select({
        id: usersTable.id,
        name: usersTable.name,
        slug: usersTable.slug,
        thumbnailUrl: usersTable.thumbnailUrl,
      })
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

/**
 * Single-entity convenience wrapper around withAuditUsers.
 */
export async function withAuditUser<T extends { createdBy: string | null; updatedBy?: string | null }>(
  ctx: { var: { db: DbOrTx } },
  entity: T,
  knownUsersInput?: KnownUsersInput,
) {
  const [result] = await withAuditUsers(ctx, [entity], knownUsersInput);
  return result;
}

/**
 * Lightweight audit-user hydration that skips DB queries entirely.
 * Uses the current user for updatedBy, stubs createdBy as null.
 * For use when the caller (e.g. frontend) already has the full cached entity
 * and only needs scalar fields + updatedBy from the response.
 */
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
