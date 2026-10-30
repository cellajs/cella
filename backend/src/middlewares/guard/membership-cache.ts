import { and, eq, getColumns } from 'drizzle-orm';
import type { Env } from '#/core/context';
import { baseDb } from '#/db/db';
import { TTLCache } from '#/lib/ttl-cache';
import { actorsTable } from '#/modules/actors/actors-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { inUnarchivedTenant } from '#/modules/memberships/memberships-queries';
import { coalesce } from '#/utils/request-coalescing';

/**
 * A user's memberships with the `actors.bindings_version` they were read at. An entry answers only to that version,
 * which a trigger replaces on every membership write (`db/membership-rules.ts`), so nothing drops entries: the TTL
 * bounds memory alone.
 */
const membershipCache = new TTLCache<{ version: string; memberships: Env['Variables']['memberships'] }>({ maxSize: 5000, defaultTtl: 30 * 60_000 });

/**
 * The user's memberships at the bindings version the request read with its session or token. A miss reads the
 * memberships with the current version in one statement and caches them under it, so a list is never stored under a
 * version newer than itself. Requests that miss at the same version share one read, which started after that version
 * was known.
 * @param userId - The acting user.
 * @param bindingsVersion - `actors.bindings_version` as the request read it.
 * @returns The memberships, at least as current as the version.
 */
export const loadMemberships = async (userId: string, bindingsVersion: string): Promise<Env['Variables']['memberships']> => {
  const cached = membershipCache.get(userId);
  if (cached?.version === bindingsVersion) return cached.memberships;

  return coalesce(`memberships:${userId}:${bindingsVersion}`, async () => {
    const { version, memberships } = await readMemberships(userId);
    if (version !== undefined) membershipCache.set(userId, { version, memberships });
    return memberships;
  });
};

/**
 * The user's memberships in unarchived tenants, read past the cache in one statement with the bindings version they
 * hold at; the version is undefined when no actor row has the id.
 */
export async function readMemberships(userId: string): Promise<{ version?: string; memberships: Env['Variables']['memberships'] }> {
  const rows = await baseDb
    .select({ version: actorsTable.bindingsVersion, membership: getColumns(membershipsTable) })
    .from(actorsTable)
    .leftJoin(membershipsTable, and(eq(membershipsTable.userId, actorsTable.id), inUnarchivedTenant(membershipsTable.tenantId)))
    .where(eq(actorsTable.id, userId));

  return { version: rows[0]?.version, memberships: rows.flatMap(({ membership }) => (membership ? [membership] : [])) };
}
