import { inArray } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import type { DbOrTx } from '#/db/db';
import { principalsTable } from '#/modules/principals/principals-db';
import { type InsertUserModel, type UserModel, usersTable } from '#/modules/user/user-db';

interface InsertUsersOptions {
  /** Skip rows that already exist (seed re-runs); a skipped user leaves no principal behind. */
  onConflictDoNothing?: boolean;
}

/**
 * The only way to insert users: the `principals` row of kind `user` goes first, in one transaction, so a failed user
 * insert (taken email, slug race) leaves no orphan principal and a missed call site fails on the foreign key.
 */
export async function insertUsers(
  db: DbOrTx,
  records: InsertUserModel[],
  { onConflictDoNothing = false }: InsertUsersOptions = {},
): Promise<UserModel[]> {
  if (records.length === 0) return [];
  const withIds = records.map((record) => ({ ...record, id: record.id ?? generateId() }));

  return db.transaction(async (tx) => {
    const principalRows = withIds.map(({ id }) => ({ id, kind: 'user' as const }));
    const principalInsert = tx.insert(principalsTable).values(principalRows);
    if (onConflictDoNothing) await principalInsert.onConflictDoNothing();
    else await principalInsert;

    const userInsert = tx.insert(usersTable).values(withIds).returning();
    const users = onConflictDoNothing ? await userInsert.onConflictDoNothing() : await userInsert;

    if (onConflictDoNothing && users.length < withIds.length) {
      const inserted = new Set(users.map((user) => user.id));
      const skipped = withIds.filter(({ id }) => !inserted.has(id)).map(({ id }) => id);
      // Only principals this call created can be dangling; a pre-existing user keeps its pre-existing principal.
      await tx.delete(principalsTable).where(inArray(principalsTable.id, skipped));
    }
    return users;
  });
}
