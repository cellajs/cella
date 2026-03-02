import { getColumns, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import type { DbOrTx } from '#/db/db';
import { usersTable } from '#/db/schema/users';
import { pickColumns } from '#/db/utils/pick-columns';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';

export type UserMinimalBase = z.infer<typeof userMinimalBaseSchema>;

// Aliases for audit user joins (createdBy / modifiedBy)
export const createdByUser = alias(usersTable, 'created_by_user');
export const modifiedByUser = alias(usersTable, 'modified_by_user');

// Derive select keys from the Zod schema, excluding entityType (added as SQL literal)
type SelectKeys = Exclude<keyof typeof userMinimalBaseSchema.shape, 'entityType'>;
const selectKeys = (Object.keys(userMinimalBaseSchema.shape) as (keyof typeof userMinimalBaseSchema.shape)[]).filter(
  (k): k is SelectKeys => k !== 'entityType',
);

/**
 * Build minimal user select columns from an aliased users table.
 * entityType is a SQL literal 'user' to preserve the literal type.
 */
const buildAuditUserSelect = (aliasedTable: typeof createdByUser | typeof modifiedByUser) => ({
  ...pickColumns(getColumns(aliasedTable), selectKeys),
  entityType: sql<'user'>`'user'`,
});

/**
 * Pre-built audit user select shapes for LEFT JOINs.
 *
 * Usage in list queries:
 * ```
 * const { createdBy: _cb, modifiedBy: _mb, ...cols } = getColumns(table);
 * const items = db.select({ ...cols, ...auditUserSelect })
 *   .from(table)
 *   .leftJoin(createdByUser, eq(createdByUser.id, table.createdBy))
 *   .leftJoin(modifiedByUser, eq(modifiedByUser.id, table.modifiedBy));
 * return coalesceAuditUsers(items);
 * ```
 */
export const auditUserSelect = {
  createdBy: buildAuditUserSelect(createdByUser),
  modifiedBy: buildAuditUserSelect(modifiedByUser),
};

/**
 * Coalesce nullable LEFT JOIN audit user fields into UserMinimalBase | null.
 * LEFT JOINs make all selected columns nullable (e.g., `id: string | null`);
 * this maps them to a proper `UserMinimalBase | null` shape.
 */
type NullableUser = {
  id: string | null;
  name: string | null;
  slug: string | null;
  thumbnailUrl: string | null;
  email: string | null;
  entityType: 'user' | null;
};

/**
 * Accept audit rows where each audit user field may have nullable or non-nullable sub-fields.
 * Drizzle LEFT JOINs make columns nullable, but `sql<'user'>` keeps entityType as `'user'`.
 * We accept both shapes to avoid `as any` at every call-site.
 */
type CompatibleNullableUser = { [K in keyof NullableUser]: NullableUser[K] | NonNullable<NullableUser[K]> };
type RawAuditRow = { createdBy: CompatibleNullableUser; modifiedBy: CompatibleNullableUser };

export function coalesceAuditUsers<T extends RawAuditRow>(
  rows: T[],
): (Omit<T, 'createdBy' | 'modifiedBy'> & { createdBy: UserMinimalBase | null; modifiedBy: UserMinimalBase | null })[] {
  return rows.map(({ createdBy, modifiedBy, ...rest }) => ({
    ...(rest as Omit<T, 'createdBy' | 'modifiedBy'>),
    createdBy: createdBy?.id ? (createdBy as UserMinimalBase) : null,
    modifiedBy: modifiedBy?.id ? (modifiedBy as UserMinimalBase) : null,
  }));
}

/**
 * Extract minimal user fields from a full user object.
 * Useful for CUD responses where the current user is known.
 */
export const toUserMinimalBase = (user: {
  id: string;
  name: string;
  slug: string;
  thumbnailUrl: string | null;
  email: string;
}): UserMinimalBase => ({
  id: user.id,
  name: user.name,
  slug: user.slug,
  thumbnailUrl: user.thumbnailUrl,
  email: user.email,
  entityType: 'user',
});

/** Input for the `knownUsers` parameter: a pre-built Map or a user-like object (auto-converted via toUserMinimalBase). */
type KnownUsersInput =
  | Map<string, UserMinimalBase>
  | { id: string; name: string; slug: string; thumbnailUrl: string | null; email: string };

/**
 * Populate createdBy/modifiedBy string IDs with UserMinimalBase objects.
 * Pass a user object (or Map) to avoid unnecessary DB lookups for the current user.
 *
 * Usage in CUD handlers:
 * ```
 * const items = await withAuditUsers(rawItems, tenantDb, user);
 * ```
 */
export async function withAuditUsers<T extends { createdBy: string | null; modifiedBy?: string | null }>(
  entities: T[],
  db: DbOrTx,
  knownUsersInput: KnownUsersInput = new Map(),
): Promise<
  (Omit<T, 'createdBy' | 'modifiedBy'> & { createdBy: UserMinimalBase | null; modifiedBy: UserMinimalBase | null })[]
> {
  // Normalize input: accept a user object or a pre-built Map
  const knownUsers =
    knownUsersInput instanceof Map
      ? knownUsersInput
      : new Map([[knownUsersInput.id, toUserMinimalBase(knownUsersInput)]]);

  // Collect all unique user IDs that need resolving
  const unknownIds = new Set<string>();
  for (const entity of entities) {
    if (entity.createdBy && !knownUsers.has(entity.createdBy)) unknownIds.add(entity.createdBy);
    if (entity.modifiedBy && !knownUsers.has(entity.modifiedBy)) unknownIds.add(entity.modifiedBy);
  }

  // Fetch unknown users in one query
  if (unknownIds.size > 0) {
    const users = await (db as any)
      .select({
        id: usersTable.id,
        name: usersTable.name,
        slug: usersTable.slug,
        thumbnailUrl: usersTable.thumbnailUrl,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, [...unknownIds]));

    for (const user of users) {
      knownUsers.set(user.id, { ...user, entityType: 'user' as const });
    }
  }

  return entities.map(({ createdBy, modifiedBy = null, ...rest }) => ({
    ...(rest as Omit<T, 'createdBy' | 'modifiedBy'>),
    createdBy: createdBy ? (knownUsers.get(createdBy) ?? null) : null,
    modifiedBy: modifiedBy ? (knownUsers.get(modifiedBy) ?? null) : null,
  }));
}

/**
 * Single-entity convenience wrapper around withAuditUsers.
 * Avoids the `[entity]` / destructure-`[0]` boilerplate.
 */
export async function withAuditUser<T extends { createdBy: string | null; modifiedBy?: string | null }>(
  entity: T,
  db: DbOrTx,
  knownUsersInput?: KnownUsersInput,
) {
  const [result] = await withAuditUsers([entity], db, knownUsersInput);
  return result;
}
