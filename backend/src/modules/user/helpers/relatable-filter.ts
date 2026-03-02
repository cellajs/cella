import { and, eq, exists, inArray } from 'drizzle-orm';
import type { DbOrTx } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { usersTable } from '#/db/schema/users';

/**
 * Builds an EXISTS filter that limits user rows to those sharing at least one
 * organization with the given org IDs. Correlates on `usersTable.id`.
 *
 * Used as defense-in-depth in cross-tenant user queries (mirrors relatableGuard).
 */
export const sharesOrgFilter = (db: DbOrTx, myOrgIds: string[]) =>
  exists(
    db
      .select({ id: membershipsTable.id })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, usersTable.id), inArray(membershipsTable.organizationId, myOrgIds))),
  );
