import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { actorsTable } from '#/modules/actors/actors-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { usersTable } from '#/modules/user/user-db';
import type { ActorRef } from '#/schemas/actor-ref';

const actorRefSelect = {
  id: actorsTable.id,
  kind: actorsTable.kind,
  name: sql<string>`coalesce(${usersTable.name}, ${serviceAccountsTable.name}, '')`,
  slug: usersTable.slug,
  thumbnailUrl: usersTable.thumbnailUrl,
};

/**
 * The references of the given actors, resolved through the supertable so a service account comes back named. A
 * deleted user leaves its `actors` row behind, so an actor without a kind row is absent here and resolves to null.
 */
async function findActorRefsByIds(ctx: DbContext, ids: string[]): Promise<ActorRef[]> {
  if (ids.length === 0) return [];
  return ctx.var.db
    .select(actorRefSelect)
    .from(actorsTable)
    .leftJoin(usersTable, eq(usersTable.id, actorsTable.id))
    .leftJoin(serviceAccountsTable, eq(serviceAccountsTable.id, actorsTable.id))
    .where(and(inArray(actorsTable.id, ids), or(isNotNull(usersTable.id), isNotNull(serviceAccountsTable.id))));
}

const actorKeys = ['createdBy', 'updatedBy', 'deletedBy'] as const;
type ActorKey = (typeof actorKeys)[number];

/** A row whose actor id columns became references: the keys it has, and only those, are replaced. */
export type WithActorRefs<T> = Omit<T, ActorKey> & { [K in ActorKey & keyof T]: ActorRef | null };

/**
 * Replaces the actor id columns of each row (`createdBy`, `updatedBy`, `deletedBy`, whichever the row has) with the
 * actor's reference, or null once the actor is gone. One query for the page, after the rows are read, so every
 * table resolves its writers the same way. Users are looked up outside RLS, like a member list.
 * @param known - References the caller already holds, such as the writer of the rows it just created.
 */
export async function withActorRefs<T extends Partial<Record<ActorKey, string | null>>>(
  ctx: DbContext,
  rows: T[],
  known: Iterable<ActorRef> = [],
): Promise<WithActorRefs<T>[]> {
  const refs = new Map<string, ActorRef>();
  for (const ref of known) refs.set(ref.id, ref);
  const missing = new Set<string>();
  for (const row of rows) {
    for (const key of actorKeys) {
      const id = row[key];
      if (typeof id === 'string' && !refs.has(id)) missing.add(id);
    }
  }
  for (const ref of await findActorRefsByIds(ctx, [...missing])) refs.set(ref.id, ref);

  return rows.map((row) => {
    const resolved: Record<string, unknown> = { ...row };
    for (const key of actorKeys) {
      if (!(key in row)) continue;
      const id = row[key];
      resolved[key] = typeof id === 'string' ? (refs.get(id) ?? null) : null;
    }
    return resolved as WithActorRefs<T>;
  });
}

/** Single-row wrapper around {@link withActorRefs}. */
export async function withActorRef<T extends Partial<Record<ActorKey, string | null>>>(
  ctx: DbContext,
  row: T,
  known: Iterable<ActorRef> = [],
): Promise<WithActorRefs<T>> {
  const [resolved] = await withActorRefs(ctx, [row], known);
  return resolved;
}

/** The reference of a user row, for a writer the caller already holds. */
export function userActorRef(user: { id: string; name: string; slug: string; thumbnailUrl: string | null }): ActorRef {
  return { id: user.id, kind: 'user', name: user.name, slug: user.slug, thumbnailUrl: user.thumbnailUrl };
}
