import { z } from '@hono/zod-openapi';
import { and, eq, getTableColumns, isNull, sql } from 'drizzle-orm';
import { appConfig, type ChannelEntityType, hierarchy, isChannel, recordFromKeys } from 'shared';
import { buildSubtreeCoverWhere } from '#/db/utils/subtree-cover';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { usersTable } from '#/modules/user/user-db';

/**
 * Product types with per-member stats for the members table (`include=counts` on GET /members);
 * must match `memberStatProductTypes` in members-columns.tsx. Counts are computed per request,
 * scoped to the viewed channel, and the subqueries read RLS-guarded tables, so the members query
 * must run under `tenantRead` when counts are requested. Apps swap this map and
 * `liveAuthoredWhere` for their own content types.
 */
const memberStatProductTables = { attachment: attachmentsTable } as const;
export type MemberStatProductType = keyof typeof memberStatProductTables;
export const memberStatProductTypes = Object.keys(memberStatProductTables) as MemberStatProductType[];

/** Channel types a member row can carry a membership count for (all non-root channels). */
const memberStatChannelTypes = hierarchy
  .getOrderedDescendants('organization')
  .filter((type): type is ChannelEntityType => isChannel(type));

/** Rows a member gets credited for: live rows they created within the viewed scope. */
const liveAuthoredWhere = (
  productType: MemberStatProductType,
  entityType: ChannelEntityType,
  entityId: string,
  organizationId: string,
) => {
  const t = memberStatProductTables[productType];
  return and(
    eq(t.createdBy, usersTable.id),
    // Org clamp is redundant for sub-channel scopes but lets a `(created_by, organization_id)` index drive every scope
    eq(t.organizationId, organizationId),
    ...(entityType === 'organization' ? [] : [buildSubtreeCoverWhere(t, productType, entityId)]),
    isNull(t.deletedAt),
  );
};

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
    const table = memberStatProductTables[type];
    const where = liveAuthoredWhere(type, entityType, entityId, organizationId);
    return sql`${sql.raw(`'${type}'`)}, (SELECT count(*)::int FROM ${table} WHERE ${where})`;
  });

  // Epoch ms of the member's latest live row per product type; null when never.
  const activityPairs = memberStatProductTypes.map((type) => {
    const table = memberStatProductTables[type];
    const where = liveAuthoredWhere(type, entityType, entityId, organizationId);
    return sql`${sql.raw(`'${type}'`)}, (SELECT (extract(epoch from max(${table.createdAt})) * 1000)::bigint
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
 * ORDER BY expression for `sort=lastPostedAt`; the caller must run under tenantRead (the product
 * table is RLS-guarded). Never-posted coalesces to -infinity so those members trail the recent
 * posters under the default descending sort (plain DESC is NULLS FIRST in Postgres).
 */
export const lastPostedAtOrder = (entityType: ChannelEntityType, entityId: string, organizationId: string) =>
  sql`coalesce((SELECT max(${attachmentsTable.createdAt}) FROM ${attachmentsTable}
    WHERE ${liveAuthoredWhere('attachment', entityType, entityId, organizationId)}), '-infinity')`;

/** Response shape for `member.counts`; membership keys are scoped to the viewed channel, so all optional. */
export const memberCountsSchema = z.object({
  memberships: z.object(recordFromKeys(memberStatChannelTypes, () => z.number().optional())),
  products: z.object(recordFromKeys(memberStatProductTypes, () => z.number())),
  activity: z.object(recordFromKeys(memberStatProductTypes, () => z.number().nullable())),
});
