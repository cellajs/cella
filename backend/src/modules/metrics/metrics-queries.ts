import { count, sql } from 'drizzle-orm';
import type { ChannelEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { countedTenantKinds } from '#/modules/tenants/tenant-restrictions';
import { tenantOfKind } from '#/modules/tenants/tenants-queries';
import { usersTable } from '#/modules/user/user-db';
import { hasProvenEmail } from '#/modules/user/user-queries';
import { getEntityTable } from '#/tables';

/** The channel type's rows in tenants of a counted kind (`appConfig.tenantKinds`), counted on the context's connection. */
export const countChannelRows = async (ctx: DbContext, { entityType }: { entityType: ChannelEntityType }) => {
  const table = getEntityTable(entityType);
  const [{ total }] = await ctx.var.db.select({ total: count() }).from(table).where(tenantOfKind(table.tenantId, countedTenantKinds()));
  return total;
};

/**
 * The accounts the public user count stands for: a proven address, and no membership at all or one in a tenant of a
 * counted kind. A demo's or a sample's account has no proven address; staff who belong to test tenants alone stay out.
 */
export const countPublicUsers = async (ctx: DbContext) => {
  const memberOf = sql`SELECT 1 FROM ${membershipsTable} WHERE ${membershipsTable.userId} = ${usersTable.id}`;
  const [{ total }] = await ctx.var.db
    .select({ total: count() })
    .from(usersTable)
    .where(
      sql`${hasProvenEmail(usersTable.id)} AND (NOT EXISTS (${memberOf}) OR EXISTS (${memberOf} AND ${tenantOfKind(membershipsTable.tenantId, countedTenantKinds())}))`,
    );
  return total;
};
