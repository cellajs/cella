import { z } from '@hono/zod-openapi';
import { and, eq, getTableColumns, isNull, type SQL, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import { appConfig, type ChannelEntityType, hierarchy, isChannel, recordFromKeys } from 'shared';
import { publishedRowsPredicate } from '#/db/utils/published-predicate';
import { buildSubtreeCoverWhere } from '#/db/utils/subtree-cover';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { usersTable } from '#/modules/user/user-db';
import { entityTables } from '#/tables';

/**
 * Product types with per-member stats for the members table (`include=counts` on GET /members),
 * from `appConfig.memberStatProductTypes`. Counts are computed per request, scoped to the viewed
 * channel, and the subqueries read RLS-guarded tables, so the members query must run under
 * `tenantRead` when counts are requested.
 */
export type MemberStatProductType = (typeof appConfig.memberStatProductTypes)[number];
export const memberStatProductTypes = appConfig.memberStatProductTypes;

/** Columns every stat product table carries (product columns); `publishedAt` marks draft-capable tables. */
type MemberStatTable = AnyPgTable & {
  createdBy: PgColumn;
  organizationId: PgColumn;
  deletedAt: PgColumn;
  createdAt: PgColumn;
  publishedAt?: PgColumn;
};

const memberStatTable = (productType: MemberStatProductType): MemberStatTable =>
  entityTables[productType as keyof typeof entityTables] as unknown as MemberStatTable;

/** Channel types a member row can carry a membership count for (all sub-organization channels). */
const memberStatChannelTypes = hierarchy
  .getOrderedDescendants('organization')
  .filter((type): type is ChannelEntityType => isChannel(type));

/** Rows a member gets credited for: live, published rows they created within the viewed scope. */
const liveAuthoredWhere = (
  productType: MemberStatProductType,
  entityType: ChannelEntityType,
  entityId: string,
  organizationId: string,
) => {
  const t = memberStatTable(productType);
  const scope: (SQL | undefined)[] = [
    eq(t.createdBy, usersTable.id),
    // Org clamp is redundant for sub-channel scopes but lets a `(created_by, organization_id)` index drive every scope
    eq(t.organizationId, organizationId),
    ...(entityType === 'organization' ? [] : [buildSubtreeCoverWhere(t, productType, entityId)]),
    isNull(t.deletedAt),
    // Drafts stay invisible to other members; a no-op for tables without `publishedAt`.
    publishedRowsPredicate(t),
  ];
  return and(...scope);
};

/** The activity stamp: publish time where rows publish, else creation time. */
const activityStamp = (t: MemberStatTable): PgColumn => t.publishedAt ?? t.createdAt;

/**
 * Select fragment for the members query: `counts: memberCountsSelect(...)`. Correlated scalar
 * subqueries per row (the `memberSelect.lastSeenAt` precedent); cost scales with page size and
 * per-user content, not channel volume.
 */
export const memberCountsSelect = (entityType: ChannelEntityType, entityId: string, organizationId: string) => {
  // Membership counts per descendant channel type, scoped by the viewed channel's ancestor column
  // on the membership rows themselves (populated by insertMemberships for every level).
  const scopeColumn = getTableColumns(membershipsTable)[appConfig.entityIdColumnKeys[entityType]].name;
  const descendantChannels = hierarchy.getOrderedDescendants(entityType).filter(isChannel);
  const membershipPairs = descendantChannels.map(
    (type) =>
      sql`${sql.raw(`'${type}'`)}, (SELECT count(*)::int FROM ${membershipsTable} mc
        WHERE mc.user_id = ${usersTable.id} AND mc.channel_type = ${sql.raw(`'${type}'`)}
          AND mc.${sql.raw(scopeColumn)} = ${entityId})`,
  );

  const productPairs = memberStatProductTypes.map((type) => {
    const table = memberStatTable(type);
    const where = liveAuthoredWhere(type, entityType, entityId, organizationId);
    return sql`${sql.raw(`'${type}'`)}, (SELECT count(*)::int FROM ${table} WHERE ${where})`;
  });

  // Epoch ms of the member's latest live row per product type; null when never.
  const activityPairs = memberStatProductTypes.map((type) => {
    const table = memberStatTable(type);
    const where = liveAuthoredWhere(type, entityType, entityId, organizationId);
    return sql`${sql.raw(`'${type}'`)}, (SELECT (extract(epoch from max(${activityStamp(table)})) * 1000)::bigint
      FROM ${table} WHERE ${where})`;
  });

  return {
    memberships: sql<
      Partial<Record<ChannelEntityType, number>>
    >`json_build_object(${sql.join(membershipPairs, sql`, `)})`,
    products: sql<Record<MemberStatProductType, number>>`json_build_object(${sql.join(productPairs, sql`, `)})`,
    activity: sql<Record<MemberStatProductType, number | null>>`json_build_object(${sql.join(activityPairs, sql`, `)})`,
  };
};

/**
 * ORDER BY expression for `sort=lastPostedAt`, over the first stat product type; the caller must
 * run under tenantRead (the product table is RLS-guarded). Never-posted coalesces to -infinity so
 * those members trail the recent posters under the default descending sort (plain DESC is NULLS
 * FIRST in Postgres).
 */
export const lastPostedAtOrder = (entityType: ChannelEntityType, entityId: string, organizationId: string) => {
  const primary = memberStatProductTypes[0];
  if (!primary) return sql`'-infinity'`;
  const table = memberStatTable(primary);
  return sql`coalesce((SELECT max(${activityStamp(table)}) FROM ${table}
    WHERE ${liveAuthoredWhere(primary, entityType, entityId, organizationId)}), '-infinity')`;
};

/** Response shape for `member.counts`; membership keys are scoped to the viewed channel, so all optional. */
export const memberCountsSchema = z.object({
  memberships: z.object(recordFromKeys(memberStatChannelTypes, () => z.number().optional())),
  products: z.object(recordFromKeys(memberStatProductTypes, () => z.number())),
  activity: z.object(recordFromKeys(memberStatProductTypes, () => z.number().nullable())),
});
