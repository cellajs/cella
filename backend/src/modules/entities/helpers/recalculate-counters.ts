import { getTableName, sql } from 'drizzle-orm';
import { appConfig, type EntityType, hierarchy, isProductEntity, roles } from 'shared';
import type { DbOrTx } from '#/db/db';
import { contextCountersTable } from '#/modules/entities/context-counters-db';
import { productCountersTable } from '#/modules/entities/product-counters-db';
import { getEntityTable } from '#/tables';

// ── SQL builder helpers ─────────────────────────────────────────────────

/** Entity type → SQL table name (e.g. 'task' → 'tasks') */
const tbl = (et: EntityType) => getTableName(getEntityTable(et));

/** Entity type → FK column name (e.g. 'project' → 'project_id') */
const fkCol = (et: string) => `${et.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}_id`;

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
 *   Phase 1 – Organization-level: m:{role}, m:total, m:pending, e:{type}
 *   Phase 2 – Sub-org contexts (e.g. project): same keys, scoped by FK
 *   Phase 3 – Seq counters: s:{type} via MAX(seq)
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
      .map((et) => countPair(`e:${et}`, `${tbl(et)} e`, 'e.organization_id = o.id')),
  ].join(', ');

  await upsertContextCounters(
    db,
    `
    SELECT o.id, jsonb_build_object(${orgPairs}), NOW()
    FROM organizations o
  `,
  );

  // ── Phase 2: Sub-org context counters (e.g. project-level) ────────────
  for (const ctxType of hierarchy.contextTypes.filter((ct) => ct !== 'organization')) {
    const fk = fkCol(ctxType);
    const children = hierarchy.getChildren(ctxType).filter((c) => isProductEntity(c));
    const allPairs = [
      ...membershipPairs('ctx', fk, ctxType, hierarchy.getRoles(ctxType)),
      ...children.map((ct) => countPair(`e:${ct}`, `${tbl(ct)} ce`, `ce.${fk} = ctx.id`)),
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
  for (const entityType of appConfig.productEntityTypes) {
    const tableName = tbl(entityType);
    const seqKey = `s:${entityType}`;
    const parentType = hierarchy.getParent(entityType);
    if (!parentType) continue;

    const pfk = fkCol(parentType);
    await upsertContextCounters(
      db,
      `
      SELECT t.${pfk}, jsonb_build_object('${seqKey}', COALESCE(MAX(t.seq), 0)), NOW()
      FROM ${tableName} t
      WHERE t.${pfk} IS NOT NULL
      GROUP BY t.${pfk}
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
