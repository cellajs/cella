import { getColumns, getTableName, sql } from 'drizzle-orm';
import { type AncestorSource, appConfig, type EntityType, hierarchy, roles } from 'shared';
import type { DbOrTx } from '#/db/db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { productCountersTable } from '#/modules/entities/product-counters-db';
import { getEntityTable } from '#/tables';

// SQL builder helpers

/** Entity type to SQL table name (e.g. 'task' to 'tasks') */
const tbl = (et: EntityType) => getTableName(getEntityTable(et));

/** Entity type to FK column name (e.g. 'project' to 'project_id') */
const fkCol = (et: string) => `${et.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}_id`;

/**
 * Live-rows-only predicate for soft-deleting tables. CDC decrements e:c: counters on
 * soft-delete transitions (and re-increments on restore), so recalculation must exclude
 * tombstones to agree.
 */
const livePredicate = (et: EntityType, alias: string) =>
  'deletedAt' in getColumns(getEntityTable(et)) ? ` AND ${alias}.deleted_at IS NULL` : '';

/**
 * Published-rows-only predicate (opt-in `publishedAt` draft lifecycle). The publication
 * row filter keeps drafts out of the CDC stream, so CDC never counts them; recalculation
 * reads the TABLE (which still contains drafts) and must exclude them to agree.
 * Empty for tables without the column.
 */
const publishedPredicate = (et: EntityType, alias: string) =>
  'publishedAt' in getColumns(getEntityTable(et)) ? ` AND ${alias}.published_at IS NOT NULL` : '';

/**
 * Deepest-non-null-ancestor grouping expression (e.g. task → COALESCE(t.project_id, t.organization_id)).
 * Matches CDC's `resolveChannelKey`: variable-depth rows scope to their effective home.
 * Exported for tests; the hierarchy parameter exists to prove the SQL shape on synthetic hierarchies.
 */
export const deepestAncestorExpr = (et: string, alias: string, h: AncestorSource = hierarchy) => {
  const ancestors = h.getOrderedAncestors(et);
  if (!ancestors.length) return null;
  return `COALESCE(${ancestors.map((a) => `${alias}.${fkCol(a)}`).join(', ')})`;
};

/** JSONB pair with a COUNT subquery: 'key', COALESCE((SELECT COUNT(*) …), 0) */
const countPair = (key: string, from: string, where: string) =>
  `'${key}', COALESCE((SELECT COUNT(*) FROM ${from} WHERE ${where}), 0)`;

/** Build JSONB pairs for membership counts: m:c:{role}…, m:c:total, m:c:pending */
const membershipPairs = (alias: string, fk: string, ctxType: string, ctxRoles: readonly string[]) => [
  ...ctxRoles.map((r) =>
    countPair(
      `m:c:${r}`,
      'memberships cm',
      `cm.${fk} = ${alias}.id AND cm.channel_type = '${ctxType}' AND cm.role = '${r}'`,
    ),
  ),
  countPair('m:c:total', 'memberships cm', `cm.${fk} = ${alias}.id AND cm.channel_type = '${ctxType}'`),
  countPair(
    'm:c:pending',
    'inactive_memberships im',
    `im.${fk} = ${alias}.id AND im.channel_type = '${ctxType}' AND im.rejected_at IS NULL`,
  ),
];

/** Upsert a SELECT into channel_counters with JSONB || merge */
const upsertChannelCounters = (db: DbOrTx, selectSql: string) =>
  db.execute(
    sql.raw(`
    INSERT INTO channel_counters (channel_key, counts, updated_at)
    ${selectSql}
    ON CONFLICT (channel_key) DO UPDATE SET
      counts = channel_counters.counts || EXCLUDED.counts,
      updated_at = NOW()
  `),
  );

/**
 * Recalculate all channel_counters and product_counters from actual database state.
 * Safe to run at any time (seed, admin repair, production incident recovery).
 *
 * Context counters (Phases 1–3):
 *   Phase 1 – Organization-level: m:c:{role}, m:c:total, m:c:pending, e:c:{type} (countable rows)
 *   Phase 2 – Sub-org channels: same keys for every descendant carrying the FK (full attribution)
 *   Phase 3 – Sequence + frontier: sequence via GREATEST(MAX(seq)) across product tables;
 *             e:f:{type} via MAX(seq) at the org and every ancestor level (drafts excluded,
 *             tombstones included); self family e:f:h:{type}/e:c:h:{type} at the home node only
 *   Phase 3b – Activity stamps: e:li:h:{type}/e:lu:h:{type} epoch ms at the home node
 *   Phase 3c – Channel path backfill (verified-ancestry source for catchup views)
 *
 * Product counters (Phase 4):
 *   Phase 4a – viewCount from seen_by (unique user views per entity)
 *   Phase 4b – Array-ref counters via appConfig.productEmbeddings
 */
export const recalculateCounters = async (db: DbOrTx) => {
  // ── Phase 1: Organization-level counters ──────────────────────────────
  const orgPairs = [
    ...membershipPairs('o', 'organization_id', 'organization', roles.all),
    ...hierarchy
      .getOrderedDescendants('organization')
      .map((et) =>
        countPair(
          `e:c:${et}`,
          `${tbl(et as EntityType)} e`,
          `e.organization_id = o.id${livePredicate(et as EntityType, 'e')}${publishedPredicate(et as EntityType, 'e')}`,
        ),
      ),
  ].join(', ');

  await upsertChannelCounters(
    db,
    `
    SELECT o.id, jsonb_build_object(${orgPairs}), NOW()
    FROM organizations o
  `,
  );

  // ── Phase 2: Sub-org context counters (e.g. project-level) ────────────
  // Full attribution: every descendant type counts on every ancestor level it carries a
  // non-null FK for (matches CDC's getEntityDeltas), not just direct product children.
  for (const ctxType of hierarchy.channelTypes.filter((ct) => ct !== 'organization')) {
    const fk = fkCol(ctxType);
    const descendants = hierarchy.getOrderedDescendants(ctxType);
    const allPairs = [
      ...membershipPairs('ctx', fk, ctxType, hierarchy.getRoles(ctxType)),
      ...descendants.map((et) =>
        countPair(
          `e:c:${et}`,
          `${tbl(et as EntityType)} ce`,
          `ce.${fk} = ctx.id${livePredicate(et as EntityType, 'ce')}${publishedPredicate(et as EntityType, 'ce')}`,
        ),
      ),
    ].join(', ');

    await upsertChannelCounters(
      db,
      `
      SELECT ctx.id, jsonb_build_object(${allPairs}), NOW()
      FROM ${tbl(ctxType)} ctx
    `,
    );
  }

  // ── Phase 3: Org sequence + frontiers from MAX(seq) ──────────────
  // `sequence` per org = the max stamped sequence value across ALL product tables (the
  // reservation counter CDC increments). `e:f:{type}` = MAX(seq) per (node, entityType)
  // at the org and at every ancestor level column, matching CDC's frontierNodeKeys rollup.
  // Tombstones keep their seq, so no live filter: MAX is a frontier.
  const sequenceMaxes = appConfig.productEntityTypes.map(
    (et) => `COALESCE((SELECT MAX(t.seq) FROM ${tbl(et)} t WHERE t.organization_id = o.id), 0)`,
  );
  if (sequenceMaxes.length > 0) {
    await upsertChannelCounters(
      db,
      `
      SELECT o.id, jsonb_build_object('sequence', GREATEST(${sequenceMaxes.join(', ')})), NOW()
      FROM organizations o
    `,
    );
  }

  for (const entityType of appConfig.productEntityTypes) {
    const tableName = tbl(entityType);
    const frontierKey = `e:f:${entityType}`;
    // Unpublished drafts are excluded from frontiers (not delta-fetchable; the
    // publication row filter keeps them from ever reaching CDC). Rows drafted before
    // the filter era may hold historical seq stamps (harmless orphans), still excluded
    // here. Tombstones stay included (delta reads return them). No live filter here.
    const frontierPredicate = publishedPredicate(entityType, 't');

    // Org node: every stamped countable row rolls up to its organization.
    await upsertChannelCounters(
      db,
      `
      SELECT t.organization_id, jsonb_build_object('${frontierKey}', COALESCE(MAX(t.seq), 0)), NOW()
      FROM ${tableName} t
      WHERE t.organization_id IS NOT NULL${frontierPredicate}
      GROUP BY t.organization_id
    `,
    );

    // Every non-root ancestor level the table carries a FK column for (full rollup,
    // matching CDC's frontierNodeKeys: org + every non-null ancestor).
    for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
      if (ancestor === 'organization') continue;
      const col = fkCol(ancestor);
      await upsertChannelCounters(
        db,
        `
        SELECT t.${col}, jsonb_build_object('${frontierKey}', COALESCE(MAX(t.seq), 0)), NOW()
        FROM ${tableName} t
        WHERE t.${col} IS NOT NULL${frontierPredicate}
        GROUP BY t.${col}
      `,
      );
    }

    // Self family (home node only, deepest non-null ancestor):
    // e:f:h:{type} = MAX(seq) of HOMED rows (drafts excluded, tombstones included);
    // e:c:h:{type} = COUNT of countable HOMED rows (live AND published).
    const homeExpr = deepestAncestorExpr(entityType, 't');
    if (homeExpr) {
      await upsertChannelCounters(
        db,
        `
        SELECT ${homeExpr}, jsonb_build_object('e:f:h:${entityType}', COALESCE(MAX(t.seq), 0)), NOW()
        FROM ${tableName} t
        WHERE ${homeExpr} IS NOT NULL${frontierPredicate}
        GROUP BY ${homeExpr}
      `,
      );
      await upsertChannelCounters(
        db,
        `
        SELECT ${homeExpr}, jsonb_build_object('e:c:h:${entityType}', COUNT(*)::int), NOW()
        FROM ${tableName} t
        WHERE ${homeExpr} IS NOT NULL${livePredicate(entityType, 't')}${publishedPredicate(entityType, 't')}
        GROUP BY ${homeExpr}
      `,
      );
    }
  }

  // ── Phase 3b: Activity stamps from MAX(published_at/created_at) / MAX(updated_at) ──
  // e:li:h:{type} = epoch ms of the latest countable row born in the context's own stream
  // (publish time on draft-lifecycle tables, created_at elsewhere), e:lu:h:{type} = epoch ms
  // of the latest countable-row update, both grouped by the home context key (deepest
  // non-null ancestor, org fallback via COALESCE). Unlike e:c: counts, these per-stream
  // signals stay at the home context and do not fan out to ancestors,
  // matching CDC's stamp scope. Unpublished drafts never stamp (they never reach CDC).
  // jsonb_strip_nulls drops e:lu:h: when no live row was ever updated (updated_at all NULL).
  for (const entityType of appConfig.productEntityTypes) {
    const tableName = tbl(entityType);
    const ctxExpr = deepestAncestorExpr(entityType, 't');
    if (!ctxExpr) continue;
    // COALESCE mirrors CDC's e:li:h: stamp source (publishedAt ?? createdAt).
    const liSource =
      'publishedAt' in getColumns(getEntityTable(entityType))
        ? 'COALESCE(t.published_at, t.created_at)'
        : 't.created_at';

    await upsertChannelCounters(
      db,
      `
      SELECT ${ctxExpr}, jsonb_strip_nulls(jsonb_build_object(
        'e:li:h:${entityType}', FLOOR(EXTRACT(EPOCH FROM MAX(${liSource})) * 1000)::bigint,
        'e:lu:h:${entityType}', FLOOR(EXTRACT(EPOCH FROM MAX(t.updated_at)) * 1000)::bigint
      )), NOW()
      FROM ${tableName} t
      WHERE ${ctxExpr} IS NOT NULL${livePredicate(entityType, 't')}${publishedPredicate(entityType, 't')}
      GROUP BY ${ctxExpr}
    `,
    );
  }

  // ── Phase 3c: Channel path backfill ───────────────────────────────────
  // Counters rows carry a copy of the channel's canonical id-path (generated column)
  // so catchup verifies claimed view ancestry without extra queries; CDC maintains it
  // incrementally, this is the rebuild/backfill.
  for (const channelType of hierarchy.channelTypes) {
    await db.execute(
      sql.raw(`
      UPDATE channel_counters cc SET path = c.path
      FROM ${tbl(channelType as EntityType)} c
      WHERE cc.channel_key = c.id::text AND cc.path IS DISTINCT FROM c.path
    `),
    );
  }

  // ── Phase 4: Product counters ─────────────────────────────────────────
  await db.delete(productCountersTable);

  // 4a: viewCount from seen_by (unique user views, 90-day window via pg_partman)
  await db.execute(
    sql.raw(`
    INSERT INTO product_counters (product_id, product_type, view_count, last_viewed_at)
    SELECT sb.product_id, sb.product_type, COUNT(DISTINCT sb.user_id)::int, MAX(sb.created_at)
    FROM seen_by sb
    GROUP BY sb.product_id, sb.product_type
    ON CONFLICT (product_id) DO UPDATE SET
      view_count = EXCLUDED.view_count,
      last_viewed_at = EXCLUDED.last_viewed_at
  `),
  );

  // 4b: Array-ref counters → channel_counters (e.g. label usage from tasks.labels[])
  for (const ref of appConfig.productEmbeddings) {
    const src = tbl(ref.hostProduct as EntityType);
    const key = `e:c:${ref.hostProduct}`;

    await upsertChannelCounters(
      db,
      `
      SELECT target_id, jsonb_build_object('${key}', COUNT(*)::int), NOW()
      FROM ${src}, unnest(${ref.hostColumn}) AS target_id
      GROUP BY target_id
    `,
    );
  }

  // Return row counts
  const [{ channelRows }] = await db
    .select({ channelRows: sql<number>`count(*)`.mapWith(Number) })
    .from(channelCountersTable);
  const [{ productRows }] = await db
    .select({ productRows: sql<number>`count(*)`.mapWith(Number) })
    .from(productCountersTable);

  return { channelRows, productRows };
};
