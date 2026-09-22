import { and, count, desc, eq, ilike } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import type { ServiceAccountListQuery } from '#/modules/service-accounts/service-accounts-schema';
import { getValidChannel } from '#/permissions';

/** Admin listing; a tenant holds one organization, so tenant scope is organization scope. */
export async function getServiceAccountsOp(ctx: UserContext, input: ServiceAccountListQuery) {
  const { db, tenantId, organizationId } = ctx.var;
  await getValidChannel(ctx, organizationId, 'organization', 'update');

  const where = and(
    eq(serviceAccountsTable.tenantId, tenantId),
    input.q ? ilike(serviceAccountsTable.name, `%${input.q}%`) : undefined,
  );
  const [items, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(serviceAccountsTable)
      .where(where)
      .orderBy(desc(serviceAccountsTable.createdAt))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ value: count() }).from(serviceAccountsTable).where(where),
  ]);
  return { items, total };
}
