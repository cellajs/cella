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
 * Live-rows-only predicate for soft-deleting tables. CDC decrements e: counters on
 * soft-delete transitions (and re-increments on restore), so recalculation must exclude
 * tombstones to agree.
 */
const livePredicate = (et: EntityType, alias: string) =>
  'deletedAt' in getColumns(getEntityTable(et)) ? ` AND ${alias}.deleted_at IS NULL` : '';

/**
 * Published-rows-only predicate (opt-in `publishedAt` draft lifecycle). CDC counts a row
 * only when live AND published (`isCountableRow` in cdc), so recalculation must exclude
 * unpublished drafts to agree. Empty for tables without the column.
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

/** Build JSONB pairs for membership counts: m:{role}…, m:total, m:pending */
const membershipPairs = (alias: string, fk: string, ctxType: string, ctxRoles: readonly string[]) => [
  ...ctxRoles.map((r) =>
    countPair(
      `m:${r}`,
      'memberships cm',
      `cm.${fk} = ${alias}.id AND cm.channel_type = '${ctxType}' AND cm.role = '${r}'`,
    ),
  ),
  countPair('m:total', 'memberships cm', `cm.${fk} = ${alias}.id AND cm.channel_type = '${ctxType}'`),
  countPair(
    'm:pending',
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
 *   Phase 1 – Organization-level: m:{role}, m:total, m:pending, e:{type} (live rows only)
 *   Phase 2 – Sub-org contexts: same keys for every descendant carrying the FK (full attribution)
 *   Phase 3 – Seq counters: s:{type} via MAX(seq), grouped by deepest non-null ancestor
 *   Phase 3b – Activity stamps: li:{type} via MAX(epoch ms of created_at) and lu:{type} via
 *              MAX(epoch ms of updated_at), live rows only, grouped by deepest non-null
 *              ancestor (home context, no ancestor fan-out)
 *
 * Product counters (Phase 4):
 *   Phase 4a – viewCount from seen_by (unique user views per entity)
 *   Phase 4b – Array-ref counters via appConfig.entityEmbeddings
 */
export const recalculateCounters = async (db: DbOrTx) => {
  // ── Phase 1: Organization-level counters ──────────────────────────────
  const orgPairs = [
    ...membershipPairs('o', 'organization_id', 'organization', roles.all),
    ...hierarchy
      .getOrderedDescendants('organization')
      .map((et) =>
        countPair(
          `e:${et}`,
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
          `e:${et}`,
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

  // ── Phase 3: Org ledger + high-water marks from MAX(seq) ──────────────
  // `s:ledger` per org = the max stamped ledger value across ALL product tables (the
  // reservation counter CDC increments). `hw:{type}` = MAX(seq) per (node, entityType)
  // at the org and at every ancestor level column, matching CDC's hwNodeKeys rollup.
  // Tombstones keep their seq, so no live filter: MAX is a high-water mark.
  const ledgerMaxes = appConfig.productEntityTypes.map(
    (et) => `COALESCE((SELECT MAX(t.seq) FROM ${tbl(et)} t WHERE t.organization_id = o.id), 0)`,
  );
  if (ledgerMaxes.length > 0) {
    await upsertChannelCounters(
      db,
      `
      SELECT o.id, jsonb_build_object('s:ledger', GREATEST(${ledgerMaxes.join(', ')})), NOW()
      FROM organizations o
    `,
    );
  }

  for (const entityType of appConfig.productEntityTypes) {
    const tableName = tbl(entityType);
    const hwKey = `hw:${entityType}`;

    // Org node: every stamped row rolls up to its organization.
    await upsertChannelCounters(
      db,
      `
      SELECT t.organization_id, jsonb_build_object('${hwKey}', COALESCE(MAX(t.seq), 0)), NOW()
      FROM ${tableName} t
      WHERE t.organization_id IS NOT NULL
      GROUP BY t.organization_id
    `,
    );

    // Every non-root ancestor level the table carries a FK column for (full rollup,
    // matching CDC's hwNodeKeys: org + every non-null ancestor).
    for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
      if (ancestor === 'organization') continue;
      const col = fkCol(ancestor);
      await upsertChannelCounters(
        db,
        `
        SELECT t.${col}, jsonb_build_object('${hwKey}', COALESCE(MAX(t.seq), 0)), NOW()
        FROM ${tableName} t
        WHERE t.${col} IS NOT NULL
        GROUP BY t.${col}
      `,
      );
    }
  }

  // ── Phase 3b: Activity stamps from MAX(published_at/created_at) / MAX(updated_at) ──
  // li:{type} = epoch ms of the latest countable row born in the context's own stream
  // (publish time on draft-lifecycle tables, created_at elsewhere), lu:{type} = epoch ms
  // of the latest countable-row update, both grouped by the home context key (deepest
  // non-null ancestor, org fallback via COALESCE). Unlike e: counts these are
  // These per-stream signals stay at the home context and do not fan out to ancestors,
  // matching CDC's stamp scope. Unpublished drafts never stamp, mirroring CDC.
  // jsonb_strip_nulls drops lu: when no live row was ever updated (updated_at all NULL).
  for (const entityType of appConfig.productEntityTypes) {
    const tableName = tbl(entityType);
    const ctxExpr = deepestAncestorExpr(entityType, 't');
    if (!ctxExpr) continue;
    // COALESCE mirrors CDC's li: stamp source (publishedAt ?? createdAt).
    const liSource =
      'publishedAt' in getColumns(getEntityTable(entityType))
        ? 'COALESCE(t.published_at, t.created_at)'
        : 't.created_at';

    await upsertChannelCounters(
      db,
      `
      SELECT ${ctxExpr}, jsonb_strip_nulls(jsonb_build_object(
        'li:${entityType}', FLOOR(EXTRACT(EPOCH FROM MAX(${liSource})) * 1000)::bigint,
        'lu:${entityType}', FLOOR(EXTRACT(EPOCH FROM MAX(t.updated_at)) * 1000)::bigint
      )), NOW()
      FROM ${tableName} t
      WHERE ${ctxExpr} IS NOT NULL${livePredicate(entityType, 't')}${publishedPredicate(entityType, 't')}
      GROUP BY ${ctxExpr}
    `,
    );
  }

  // ── Phase 4: Product counters ─────────────────────────────────────────
  await db.delete(productCountersTable);

  // 4a: viewCount from seen_by (unique user views, 90-day window via pg_partman)
  await db.execute(
    sql.raw(`
    INSERT INTO product_counters (entity_id, entity_type, view_count, last_viewed_at)
    SELECT sb.entity_id, sb.entity_type, COUNT(DISTINCT sb.user_id)::int, MAX(sb.created_at)
    FROM seen_by sb
    GROUP BY sb.entity_id, sb.entity_type
    ON CONFLICT (entity_id) DO UPDATE SET
      view_count = EXCLUDED.view_count,
      last_viewed_at = EXCLUDED.last_viewed_at
  `),
  );

  // 4b: Array-ref counters → channel_counters (e.g. label usage from tasks.labels[])
  for (const ref of appConfig.entityEmbeddings) {
    const src = tbl(ref.hostEntity as EntityType);
    const key = `e:${ref.hostEntity}`;

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
