import { inArray } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { type ActorKind, actorsTable } from '#/modules/actors/actors-db';

interface InsertActorsOpts {
  ids: string[];
  kind: ActorKind;
  /** Leave existing ids alone. */
  onConflictDoNothing?: boolean;
}

/**
 * Actor rows for ids about to get a kind row. Returns the ids this call inserted, so a caller cleaning up after a
 * skipped kind row never touches a pre-existing actor.
 */
export async function insertActors(ctx: DbContext, { ids, kind, onConflictDoNothing = false }: InsertActorsOpts): Promise<string[]> {
  if (ids.length === 0) return [];
  const insert = ctx.var.db
    .insert(actorsTable)
    .values(ids.map((id) => ({ id, kind })))
    .returning({ id: actorsTable.id });
  const rows = onConflictDoNothing ? await insert.onConflictDoNothing() : await insert;
  return rows.map((row) => row.id);
}

interface DeleteDanglingActorsOpts {
  ids: string[];
}

/** Removes actors this call created whose kind row was skipped, so every actor keeps a kind row. */
export async function deleteDanglingActors(ctx: DbContext, { ids }: DeleteDanglingActorsOpts): Promise<void> {
  if (ids.length > 0) await ctx.var.db.delete(actorsTable).where(inArray(actorsTable.id, ids));
}
