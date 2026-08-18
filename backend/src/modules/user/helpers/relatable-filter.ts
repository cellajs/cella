import { and, eq, exists, inArray } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { usersTable } from '#/modules/user/user-db';

/** EXISTS filter limiting user rows to those sharing an organization with `myOrgIds`: defense in depth mirroring relatableGuard. */
export const sharesOrgFilter = (ctx: DbContext, { myOrgIds }: { myOrgIds: string[] }) => {
  const { db } = ctx.var;
  return exists(
    db
      .select({ id: membershipsTable.id })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, usersTable.id), inArray(membershipsTable.organizationId, myOrgIds))),
  );
};
