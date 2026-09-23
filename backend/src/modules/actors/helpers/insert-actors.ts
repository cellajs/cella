import { inArray } from 'drizzle-orm';
import type { DbOrTx } from '#/db/db';
import { type ActorKind, actorsTable } from '#/modules/actors/actors-db';

/**
 * Actor rows for ids about to get a kind row; with `onConflictDoNothing`, existing ids are left alone. Returns
 * the ids this call inserted, so a caller cleaning up after a skipped kind row never touches a pre-existing actor.
 */
export async function insertActors(
  tx: DbOrTx,
  ids: string[],
  kind: ActorKind,
  { onConflictDoNothing = false } = {},
): Promise<string[]> {
  if (ids.length === 0) return [];
  const insert = tx
    .insert(actorsTable)
    .values(ids.map((id) => ({ id, kind })))
    .returning({ id: actorsTable.id });
  const rows = onConflictDoNothing ? await insert.onConflictDoNothing() : await insert;
  return rows.map((row) => row.id);
}

/** Removes actors this call created whose kind row was skipped, so every actor keeps a kind row. */
export async function deleteDanglingActors(tx: DbOrTx, ids: string[]): Promise<void> {
  if (ids.length > 0) await tx.delete(actorsTable).where(inArray(actorsTable.id, ids));
}
