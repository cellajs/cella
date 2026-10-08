import { eq, getTableColumns } from 'drizzle-orm';
import { baseDb } from '#/db/db';
import { TTLCache } from '#/lib/ttl-cache';
import { actorsTable } from '#/modules/actors/actors-db';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { coalesce } from '#/utils/request-coalescing';

export type CachedMemberships = (MembershipBaseModel & { createdBy: string | null })[];

/**
 * A user's memberships with the `actors.bindings_version` they were read at. An entry answers only to that version,
 * which a trigger replaces on every membership write (`db/membership-rules.ts`), so nothing drops entries: the TTL
 * bounds memory alone.
 */
const membershipCache = new TTLCache<{ version: string; memberships: CachedMemberships }>({ maxSize: 5000, defaultTtl: 30 * 60_000 });

/**
 * The user's memberships at the bindings version the request read with its session or token. A miss reads the
 * memberships with the current version in one statement and caches them under it, so a list is never stored under a
 * version newer than itself. Requests that miss at the same version share one read, which started after that version
 * was known.
 * @param userId - The acting user.
 * @param bindingsVersion - `actors.bindings_version` as the request read it.
 * @returns The memberships, at least as current as the version.
 */
export const loadMemberships = async (userId: string, bindingsVersion: string): Promise<CachedMemberships> => {
  const cached = membershipCache.get(userId);
  if (cached?.version === bindingsVersion) return cached.memberships;

  return coalesce(`memberships:${userId}:${bindingsVersion}`, async () => {
    const rows = await baseDb
      .select({ version: actorsTable.bindingsVersion, membership: getTableColumns(membershipsTable) })
      .from(actorsTable)
      .leftJoin(membershipsTable, eq(membershipsTable.userId, actorsTable.id))
      .where(eq(actorsTable.id, userId));

    const memberships = rows.flatMap(({ membership }) => (membership ? [membership] : []));
    if (rows[0]) membershipCache.set(userId, { version: rows[0].version, memberships });
    return memberships;
  });
};
