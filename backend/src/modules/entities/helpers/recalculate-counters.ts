import { getColumns, getTableName, sql } from 'drizzle-orm';
import { type AncestorSource, appConfig, type EntityType, hierarchy, roles } from 'shared';
import type { DbOrTx } from '#/db/db';
import { contextCountersTable } from '#/modules/entities/context-counters-db';
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
 * Deepest-non-null-ancestor grouping expression (e.g. task → COALESCE(t.project_id, t.organization_id)).
 * Matches CDC's `resolveContextKey`: variable-depth rows scope to their effective home.
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
      `cm.${fk} = ${alias}.id AND cm.context_type = '${ctxType}' AND cm.role = '${r}'`,
    ),
  ),
  countPair('m:total', 'memberships cm', `cm.${fk} = ${alias}.id AND cm.context_type = '${ctxType}'`),
  countPair(
    'm:pending',
    'inactive_memberships im',
    `im.${fk} = ${alias}.id AND im.context_type = '${ctxType}' AND im.rejected_at IS NULL`,
  ),
];

/** Upsert a SELECT into context_counters with JSONB || merge */
const upsertContextCounters = (db: DbOrTx, selectSql: string) =>
  db.execute(
    sql.raw(`
    INSERT INTO context_counters (context_key, counts, updated_at)
    ${selectSql}
    ON CONFLICT (context_key) DO UPDATE SET
      counts = context_counters.counts || EXCLUDED.counts,
      updated_at = NOW()
  `),
  );

/**
 * Recalculate all context_counters and product_counters from actual database state.
 * Safe to run at any time (seed, admin repair, production incident recovery).
 *
 * Context counters (Phases 1–3):
 *   Phase 1 – Organization-level: m:{role}, m:total, m:pending, e:{type} (live rows only)
 *   Phase 2 – Sub-org contexts: same keys for every descendant carrying the FK (full attribution)
 *   Phase 3 – Seq counters: s:{type} via MAX(seq), grouped by deepest non-null ancestor
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
          `e.organization_id = o.id${livePredicate(et as EntityType, 'e')}`,
        ),
      ),
  ].join(', ');

  await upsertContextCounters(
    db,
    `
    SELECT o.id, jsonb_build_object(${orgPairs}), NOW()
    FROM organizations o
  `,
  );

  // ── Phase 2: Sub-org context counters (e.g. project-level) ────────────
  // Full attribution: every descendant type counts on every ancestor level it carries a
  // non-null FK for (matches CDC's getEntityDeltas), not just direct product children.
  for (const ctxType of hierarchy.contextTypes.filter((ct) => ct !== 'organization')) {
    const fk = fkCol(ctxType);
    const descendants = hierarchy.getOrderedDescendants(ctxType);
    const allPairs = [
      ...membershipPairs('ctx', fk, ctxType, hierarchy.getRoles(ctxType)),
      ...descendants.map((et) =>
        countPair(
          `e:${et}`,
          `${tbl(et as EntityType)} ce`,
          `ce.${fk} = ctx.id${livePredicate(et as EntityType, 'ce')}`,
        ),
      ),
    ].join(', ');

    await upsertContextCounters(
      db,
      `
      SELECT ctx.id, jsonb_build_object(${allPairs}), NOW()
      FROM ${tbl(ctxType)} ctx
    `,
    );
  }

  // ── Phase 3: Seq counters from MAX(seq) ───────────────────────────────
  // Grouped by the deepest non-null ancestor, the same scope CDC stamps seqs from.
  // Tombstones keep their seq, so no live filter: MAX is a high-water mark.
  for (const entityType of appConfig.productEntityTypes) {
    const tableName = tbl(entityType);
    const seqKey = `s:${entityType}`;
    const ctxExpr = deepestAncestorExpr(entityType, 't');
    if (!ctxExpr) continue;

    await upsertContextCounters(
      db,
      `
      SELECT ${ctxExpr}, jsonb_build_object('${seqKey}', COALESCE(MAX(t.seq), 0)), NOW()
      FROM ${tableName} t
      WHERE ${ctxExpr} IS NOT NULL
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
    SELECT sb.entity_id, sb.entity_type, COUNT(*)::int, MAX(sb.created_at)
    FROM seen_by sb
    GROUP BY sb.entity_id, sb.entity_type
    ON CONFLICT (entity_id) DO UPDATE SET
      view_count = EXCLUDED.view_count,
      last_viewed_at = EXCLUDED.last_viewed_at
  `),
  );

  // 4b: Array-ref counters → context_counters (e.g. label usage from tasks.labels[])
  for (const ref of appConfig.entityEmbeddings) {
    const src = tbl(ref.hostEntity as EntityType);
    const key = `e:${ref.hostEntity}`;

    await upsertContextCounters(
      db,
      `
      SELECT target_id, jsonb_build_object('${key}', COUNT(*)::int), NOW()
      FROM ${src}, unnest(${ref.hostColumn}) AS target_id
      GROUP BY target_id
    `,
    );
  }

  // Return row counts
  const [{ contextRows }] = await db
    .select({ contextRows: sql<number>`count(*)`.mapWith(Number) })
    .from(contextCountersTable);
  const [{ productRows }] = await db
    .select({ productRows: sql<number>`count(*)`.mapWith(Number) })
    .from(productCountersTable);

  return { contextRows, productRows };
};
