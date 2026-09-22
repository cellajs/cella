import { inArray } from 'drizzle-orm';
import type { DbOrTx } from '#/db/db';
import { type PrincipalKind, principalsTable } from '#/modules/principals/principals-db';

/** Principal rows for ids about to get a kind row; with `onConflictDoNothing`, existing ids are left alone. */
export async function insertPrincipals(
  tx: DbOrTx,
  ids: string[],
  kind: PrincipalKind,
  { onConflictDoNothing = false } = {},
): Promise<void> {
  if (ids.length === 0) return;
  const insert = tx.insert(principalsTable).values(ids.map((id) => ({ id, kind })));
  if (onConflictDoNothing) await insert.onConflictDoNothing();
  else await insert;
}

/** Removes principals this call created whose kind row was skipped, so every principal keeps a kind row. */
export async function deleteDanglingPrincipals(tx: DbOrTx, ids: string[]): Promise<void> {
  if (ids.length > 0) await tx.delete(principalsTable).where(inArray(principalsTable.id, ids));
}
