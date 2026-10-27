import { getColumns, getTableName, sql } from 'drizzle-orm';
import { appConfig, type EntityType, entityIdColumnName, hierarchy } from 'shared';
import type { DbContext } from '#/core/context';
import type { DbOrTx } from '#/db/db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { forwardOnlyCounterKeySql, plainCountKeySql } from '#/modules/entities/counter-keys';
import { productCountersTable } from '#/modules/entities/product-counters-db';
import { getEntityTable } from '#/tables';

// SQL builder helpers

const tbl = (et: EntityType) => getTableName(getEntityTable(et));

/** CDC decrements e:c: counters on soft-delete, so recalculation must exclude tombstones to agree. */
const livePredicate = (et: EntityType, alias: string) => ('deletedAt' in getColumns(getEntityTable(et)) ? ` AND ${alias}.deleted_at IS NULL` : '');

/** CDC never counts drafts, so recalculation must exclude them from the table to agree. */
const publishedPredicate = (et: EntityType, alias: string) =>
  'publishedAt' in getColumns(getEntityTable(et)) ? ` AND ${alias}.published_at IS NOT NULL` : '';

/** JSONB pair with a COUNT subquery: 'key', COALESCE((SELECT COUNT(*) …), 0) */
const countPair = (key: string, from: string, where: string) => `'${key}', COALESCE((SELECT COUNT(*) FROM ${from} WHERE ${where}), 0)`;

/** Build JSONB pairs for membership counts: m:c:{role}…, m:c:total, m:c:pending */
const membershipPairs = (alias: string, fk: string, ctxType: string, ctxRoles: readonly string[]) => [
  ...ctxRoles.map((r) => countPair(`m:c:${r}`, 'memberships cm', `cm.${fk} = ${alias}.id AND cm.channel_type = '${ctxType}' AND cm.role = '${r}'`)),
  countPair('m:c:total', 'memberships cm', `cm.${fk} = ${alias}.id AND cm.channel_type = '${ctxType}'`),
  countPair('m:c:pending', 'inactive_memberships im', `im.${fk} = ${alias}.id AND im.channel_type = '${ctxType}' AND im.rejected_at IS NULL`),
];

/**
 * Upsert a SELECT into channel_counters with JSONB || merge. A forward-only key keeps the higher of the stored and the
 * counted value: the worker may have handed out sequence values the count's snapshot does not see yet.
 */
const upsertChannelCounters = (db: DbOrTx, selectSql: string) =>
  db.execute(
    sql.raw(`
    INSERT INTO channel_counters (channel_key, counts, updated_at)
    ${selectSql}
    ON CONFLICT (channel_key) DO UPDATE SET
      counts = channel_counters.counts || EXCLUDED.counts || (
        SELECT COALESCE(jsonb_object_agg(k, GREATEST((channel_counters.counts->>k)::bigint, (EXCLUDED.counts->>k)::bigint)), '{}'::jsonb)
        FROM jsonb_object_keys(EXCLUDED.counts) k
        WHERE ${forwardOnlyCounterKeySql('k')} AND channel_counters.counts ? k
      ),
      updated_at = NOW()
  `),
  );

/**
 * Every SELECT that yields `(channel_key, counts)` rows of the channel counters as counted from the tables, in the
 * order they merge. The one body for the seed's rebuild and for the CDC worker's verify and rebuild, so the two can
 * never count differently.
 */
function channelCounterSelects(): string[] {
  const selects: string[] = [];
  // Every descendant counts on every ancestor level it has a non-null FK for, as in getEntityDeltas.
  for (const ctxType of hierarchy.channelTypes) {
    const fk = entityIdColumnName(ctxType);
    const descendants = hierarchy.getOrderedDescendants(ctxType);
    const allPairs = [
      ...membershipPairs('ctx', fk, ctxType, hierarchy.getRoles(ctxType)),
      ...descendants.map((et) =>
        countPair(`e:c:${et}`, `${tbl(et)} ce`, `ce.${fk} = ctx.id${livePredicate(et, 'ce')}${publishedPredicate(et, 'ce')}`),
      ),
    ].join(', ');

    selects.push(`
      SELECT ctx.id, jsonb_build_object(${allPairs}), NOW()
      FROM ${tbl(ctxType)} ctx
    `);
  }

  // Rebuilt from the maximum stamped sequence; tombstones stay part of the frontier, as in CDC.
  const sequenceMaxes = appConfig.productEntityTypes.map((et) => `COALESCE((SELECT MAX(t.seq) FROM ${tbl(et)} t WHERE t.organization_id = o.id), 0)`);
  if (sequenceMaxes.length > 0) {
    selects.push(`
      SELECT o.id, jsonb_build_object('sequence', GREATEST(${sequenceMaxes.join(', ')})), NOW()
      FROM organizations o
    `);
  }

  for (const entityType of appConfig.productEntityTypes) {
    const tableName = tbl(entityType);
    const frontierKey = `e:f:${entityType}`;
    // Unpublished drafts are not delta-fetchable so they are excluded; tombstones are retained.
    const frontierPredicate = publishedPredicate(entityType, 't');

    // Every ancestor level with a FK column, the organization included, matching CDC's frontierNodeKeys.
    for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
      const col = entityIdColumnName(ancestor);
      selects.push(`
        SELECT t.${col}, jsonb_build_object('${frontierKey}', COALESCE(MAX(t.seq), 0)), NOW()
        FROM ${tableName} t
        WHERE t.${col} IS NOT NULL${frontierPredicate}
        GROUP BY t.${col}
      `);
    }

    const homeExpr = hierarchy.deepestAncestorSql(entityType, 't');
    if (!homeExpr) continue;
    // Self family, home node only: e:f:h:{type} = MAX(seq) of homed rows (drafts excluded,
    // tombstones included); e:c:h:{type} = COUNT of live and published homed rows.
    selects.push(`
      SELECT ${homeExpr}, jsonb_build_object('e:f:h:${entityType}', COALESCE(MAX(t.seq), 0)), NOW()
      FROM ${tableName} t
      WHERE ${homeExpr} IS NOT NULL${frontierPredicate}
      GROUP BY ${homeExpr}
    `);
    selects.push(`
      SELECT ${homeExpr}, jsonb_build_object('e:c:h:${entityType}', COUNT(*)::int), NOW()
      FROM ${tableName} t
      WHERE ${homeExpr} IS NOT NULL${livePredicate(entityType, 't')}${publishedPredicate(entityType, 't')}
      GROUP BY ${homeExpr}
    `);

    // Home-only stamps: no fan-out to ancestors, and null update maxima are omitted from the JSON.
    // COALESCE mirrors CDC's e:li:h: stamp source (publishedAt ?? createdAt).
    const liSource = 'publishedAt' in getColumns(getEntityTable(entityType)) ? 'COALESCE(t.published_at, t.created_at)' : 't.created_at';
    selects.push(`
      SELECT ${homeExpr}, jsonb_strip_nulls(jsonb_build_object(
        'e:li:h:${entityType}', FLOOR(EXTRACT(EPOCH FROM MAX(${liSource})) * 1000)::bigint,
        'e:lu:h:${entityType}', FLOOR(EXTRACT(EPOCH FROM MAX(t.updated_at)) * 1000)::bigint
      )), NOW()
      FROM ${tableName} t
      WHERE ${homeExpr} IS NOT NULL${livePredicate(entityType, 't')}${publishedPredicate(entityType, 't')}
      GROUP BY ${homeExpr}
    `);
  }

  // A channel below the organization is homed too, at its deepest ancestor: the worker counts it there as it does a
  // product row, and the channel counts of the API read that key for every descendant type.
  for (const channelType of hierarchy.channelTypes.filter((ct) => ct !== 'organization')) {
    const homeExpr = hierarchy.deepestAncestorSql(channelType, 't');
    if (!homeExpr) continue;
    selects.push(`
      SELECT ${homeExpr}, jsonb_build_object('e:c:h:${channelType}', COUNT(*)::int), NOW()
      FROM ${tbl(channelType)} t
      WHERE ${homeExpr} IS NOT NULL${livePredicate(channelType, 't')}${publishedPredicate(channelType, 't')}
      GROUP BY ${homeExpr}
    `);
  }

  return selects;
}

/**
 * The channel counters as counted from the tables, without writing them. Run it in a REPEATABLE READ transaction to
 * count at one snapshot.
 * @param ctx - Carries the connection or transaction to count on.
 * @returns Counter keys and values per channel key.
 */
export const computeChannelCounters = async (ctx: DbContext): Promise<Map<string, Record<string, number>>> => {
  const counted = new Map<string, Record<string, number>>();
  for (const select of channelCounterSelects()) {
    const result = await ctx.var.db.execute<{ channel_key: string | null; counts: Record<string, number> }>(
      sql.raw(`SELECT q.channel_key::text AS channel_key, q.counts FROM (${select}) AS q(channel_key, counts, updated_at)`),
    );
    for (const { channel_key: channelKey, counts } of result.rows) {
      if (channelKey === null) continue;
      counted.set(channelKey, { ...counted.get(channelKey), ...counts });
    }
  }
  return counted;
};

/**
 * Replaces the channel counters by a recount from the tables: for a seed on a database no CDC worker reads yet, and
 * for the worker's rebuild. A plain count the tables no longer give a row for becomes zero; the sequence counter and
 * the frontiers never go down. Run it in one transaction, so no reader sees the counts at zero.
 * @param ctx - The connection or transaction to recount in.
 * @returns How many channels have a counter row afterwards.
 */
export const recalculateCounters = async (ctx: DbContext) => {
  const { db } = ctx.var;
  // A plain count the tables give no row for any more is zero, not what it was.
  await db.execute(
    sql.raw(`
    UPDATE channel_counters SET counts = counts || (
      SELECT COALESCE(jsonb_object_agg(k, 0), '{}'::jsonb) FROM jsonb_object_keys(counts) k WHERE ${plainCountKeySql('k')}
    )
  `),
  );
  for (const select of channelCounterSelects()) await upsertChannelCounters(db, select);

  // Canonical channel paths let catchup verify ancestry; CDC keeps them, this copies the ones that differ.
  for (const channelType of hierarchy.channelTypes) {
    await db.execute(
      sql.raw(`UPDATE channel_counters cc SET path = c.path
      FROM ${tbl(channelType)} c
      WHERE cc.channel_key = c.id::text AND cc.path IS DISTINCT FROM c.path`),
    );
  }

  const [{ channelRows }] = await db.select({ channelRows: sql<number>`count(*)`.mapWith(Number) }).from(channelCountersTable);
  return { channelRows };
};

/**
 * Recounts the view count of every product from `seen_by` (unique users over its 90-day retention). The API keeps
 * these counts itself with every view, and no sync client reads them: a seed is the only caller.
 * @param ctx - The connection to recount on.
 * @returns How many products have a view count afterwards.
 */
export const recalculateViewCounts = async (ctx: DbContext) => {
  const { db } = ctx.var;
  await db.delete(productCountersTable);
  await db.execute(
    sql.raw(`
    INSERT INTO product_counters (product_id, product_type, view_count)
    SELECT sb.product_id, sb.product_type, COUNT(DISTINCT sb.user_id)::int
    FROM seen_by sb
    GROUP BY sb.product_id, sb.product_type
    ON CONFLICT (product_id) DO UPDATE SET
      view_count = EXCLUDED.view_count
  `),
  );
  const [{ productRows }] = await db.select({ productRows: sql<number>`count(*)`.mapWith(Number) }).from(productCountersTable);
  return { productRows };
};
