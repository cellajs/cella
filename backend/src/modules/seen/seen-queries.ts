import { and, count, getColumns, gt, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import { type SeenTrackedProductType, seenWindowMs } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { DbContext } from '#/core/context';
import { homeChannelIdSql } from '#/db/utils/home-channel';
import { hasPublishedAt, publishedRowsPredicate } from '#/db/utils/published-predicate';
import { seenByTable } from '#/modules/seen/seen-by-db';
import { getEntityTable } from '#/tables';

/** The columns the seen queries read off a product table resolved at runtime. */
export type OrgScopedEntityTable = AnyPgTable & { id: PgColumn; organizationId: PgColumn; createdAt: PgColumn };

/** Where the seen window starts now: a row older than `seenWindowMs`, the client's window too, is never unseen. */
export const seenWindowStart = () => new Date(Date.now() - seenWindowMs).toISOString();

/** A row's recency for the seen window: publish time on draft-lifecycle tables, creation time elsewhere. */
export const seenRecencySql = (table: AnyPgTable & { createdAt: PgColumn }): SQL<string> =>
  hasPublishedAt(table) ? sql<string>`COALESCE(${table.publishedAt}, ${table.createdAt})` : sql<string>`${table.createdAt}`;

interface FindUnseenCountsByUserOpts {
  userId: string;
  channelIds: string[];
  productTypes: readonly SeenTrackedProductType[];
  cutoff: string;
  /** Per-type collection read filter. An `undefined` value or an absent type counts unrestricted, so callers pre-drop types scoped `none`. */
  scopeWhereByType?: Partial<Record<SeenTrackedProductType, SQL | undefined>>;
}

/**
 * Counts readable, live, unseen rows in the recency window by home channel. Draft-lifecycle rows use publish time,
 * others creation time; `unseen-sync.ts` mirrors this.
 */
export const findUnseenCountsByUser = async (
  ctx: DbContext,
  { userId, channelIds, productTypes, cutoff, scopeWhereByType }: FindUnseenCountsByUserOpts,
) => {
  const { db } = ctx.var;
  const rows: { channelId: string; productType: SeenTrackedProductType; unseenCount: number }[] = [];

  for (const productType of productTypes) {
    const entityTable = getEntityTable(productType);
    const orgTable = entityTable as OrgScopedEntityTable;
    const columns = getColumns(entityTable) as Record<string, PgColumn | undefined>;

    const channelIdColumn = homeChannelIdSql(productType, entityTable);

    const filters = [
      inArray(channelIdColumn, channelIds),
      gt(seenRecencySql(orgTable), cutoff),
      sql`NOT EXISTS (SELECT 1 FROM ${seenByTable} WHERE ${seenByTable.userId} = ${userId} AND ${seenByTable.productId} = ${orgTable.id})`,
      columns.deletedAt ? isNull(columns.deletedAt) : undefined,
      // Feed parity: unpublished drafts are hidden from every feed, so they are never unseen.
      publishedRowsPredicate(entityTable),
      scopeWhereByType?.[productType],
    ];

    const entityRows = await db
      .select({ channelId: channelIdColumn, productType: sql<SeenTrackedProductType>`${productType}`, unseenCount: count() })
      .from(entityTable)
      .where(and(...filters))
      .groupBy(channelIdColumn);

    rows.push(...entityRows);
  }

  return rows;
};

interface FindSeenCandidatesOpts {
  productType: SeenTrackedProductType;
  /** Which rows count: the caller's ids, organization, seen window and read scope. */
  where: SQL[];
}

/** The rows of `productType` the filters admit, each with its home channel. */
export const findSeenCandidates = async (ctx: DbContext, { productType, where }: FindSeenCandidatesOpts) => {
  const table = getEntityTable(productType) as OrgScopedEntityTable;
  // The entity table is resolved at runtime, so its id column reads as unknown; every entity id is a string.
  const rows = await ctx.var.db
    .select({ id: table.id, channelId: homeChannelIdSql(productType, table) })
    .from(table)
    .where(and(...where));
  return rows as { id: string; channelId: string }[];
};

interface InsertSeenByOpts {
  userId: string;
  productType: SeenTrackedProductType;
  organizationId: string;
  tenantId: string;
  /** The rows the user saw, each with its home channel. */
  rows: { productId: string; channelId: string }[];
}

/**
 * Records the rows as seen by the user and bumps the view count of each one seen for the first time; returns how many
 * were new. Partitioning rules out a unique user/product index, so the insert tests for an earlier row itself, and a
 * transaction-scoped lock on the user makes two marks of one user (two tabs, a beacon beside the timer flush) wait for
 * each other: the second one sees the first one's rows and counts nothing twice. Runs in the caller's transaction.
 */
export const insertSeenBy = async (ctx: DbContext, { userId, productType, organizationId, tenantId, rows }: InsertSeenByOpts) => {
  const { db } = ctx.var;
  // Its own statement: the insert below must take its snapshot after the lock is granted.
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`seen_by:${userId}`}, 0))`);

  const values = sql.join(
    rows.map(
      ({ productId, channelId }) =>
        sql`(${generateId()}::uuid, ${userId}::uuid, ${productId}::uuid, ${productType}, ${channelId}::uuid, ${organizationId}::uuid, ${tenantId}, now())`,
    ),
    sql`, `,
  );

  const result = await db.execute<{ new_count: number }>(sql`
    WITH candidate (id, user_id, product_id, product_type, channel_id, organization_id, tenant_id, created_at) AS (
      VALUES ${values}
    ),
    inserted AS (
      INSERT INTO seen_by (id, user_id, product_id, product_type, channel_id, organization_id, tenant_id, created_at)
      SELECT c.id, c.user_id, c.product_id, c.product_type, c.channel_id, c.organization_id, c.tenant_id, c.created_at
      FROM candidate c
      WHERE NOT EXISTS (
        SELECT 1 FROM seen_by sb WHERE sb.user_id = c.user_id AND sb.product_id = c.product_id
      )
      RETURNING product_id
    ),
    counters AS (
      INSERT INTO product_counters (product_id, product_type, view_count)
      SELECT product_id, ${productType}, 1
      FROM inserted
      ON CONFLICT (product_id) DO UPDATE SET
        view_count = product_counters.view_count + 1
    )
    SELECT count(*)::int AS new_count FROM inserted
  `);

  return Number(result.rows[0]?.new_count ?? 0);
};
