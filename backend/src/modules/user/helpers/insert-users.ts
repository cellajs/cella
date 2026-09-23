import { generateId } from 'shared/utils/entity-id';
import type { DbOrTx } from '#/db/db';
import { deleteDanglingActors, insertActors } from '#/modules/actors/helpers/insert-actors';
import { type InsertUserModel, type UserModel, usersTable } from '#/modules/user/user-db';

interface InsertUsersOptions {
  /** Skip rows that already exist (seed re-runs); a skipped user leaves no actor behind. */
  onConflictDoNothing?: boolean;
}

/**
 * The only way to insert users: the `actors` row of kind `user` goes first, in one transaction, so a failed user
 * insert (taken email, slug race) leaves no orphan actor and a missed call site fails on the foreign key.
 */
export async function insertUsers(
  db: DbOrTx,
  records: InsertUserModel[],
  { onConflictDoNothing = false }: InsertUsersOptions = {},
): Promise<UserModel[]> {
  if (records.length === 0) return [];
  const withIds = records.map((record) => ({ ...record, id: record.id ?? generateId() }));

  return db.transaction(async (tx) => {
    const actorIds = await insertActors(
      tx,
      withIds.map(({ id }) => id),
      'user',
      { onConflictDoNothing },
    );
    const userInsert = tx.insert(usersTable).values(withIds).returning();
    const users = onConflictDoNothing ? await userInsert.onConflictDoNothing() : await userInsert;

    // Only actors this call created and whose user row was skipped; an id that already existed keeps its user.
    if (onConflictDoNothing && users.length < withIds.length) {
      const inserted = new Set(users.map((user) => user.id));
      await deleteDanglingActors(
        tx,
        actorIds.filter((id) => !inserted.has(id)),
      );
    }
    return users;
  });
}
