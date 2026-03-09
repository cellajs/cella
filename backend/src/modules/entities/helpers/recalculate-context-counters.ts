import { getTableName, sql } from 'drizzle-orm';
import { appConfig, type EntityType, hierarchy, isProductEntity, roles } from 'shared';
import type { DbOrTx } from '#/db/db';
import { contextCountersTable } from '#/db/schema/context-counters';
import { entityTables } from '#/table-config';

/** Resolve entity type → SQL table name via Drizzle (e.g. 'task' → 'tasks') */
const sqlTableName = (entityType: EntityType) => getTableName(entityTables[entityType]);

/**
 * Recalculate all context_counters from actual database state.
 *
 * Safe to run at any time (seed, admin repair, production incident recovery).
 * Uses ON CONFLICT with || merge so trigger-managed keys (s:{type}) are preserved
 * unless explicitly recalculated in Phase 3.
 *
 * Phase 1 – Organization-level counters:
 *   - m:{role}, m:total from memberships
 *   - m:pending from inactive_memberships (where rejected_at IS NULL)
 *   - e:{type} from child entity tables
 *
 * Phase 2 – Sub-org context counters (e.g. project-level):
 *   - e:{type} for product entities parented to non-organization contexts
 *
 * Phase 3 – Seq counters (s:{type}):
 *   - Reconcile from MAX(seq_at) per entity type per context
 *   - Ensures sync engine sees correct high-water marks
 *
 * @param db - Database connection (admin/migration or runtime)
 * @returns Number of context_counters rows after recalculation
 */
export const recalculateContextCounters = async (db: DbOrTx): Promise<number> => {
  // ── Phase 1: Organization-level counters ──────────────────────────────

  const allRoles = roles.all;
  const childEntityTypes = hierarchy.getChildren('organization');

  // Membership role counts: m:admin, m:member, ...
  const roleParts = allRoles.map(
    (role) => `'m:${role}', COALESCE(SUM(CASE WHEN m.role = '${role}' THEN 1 ELSE 0 END), 0)`,
  );
  const totalPart = `'m:total', COALESCE(COUNT(m.id), 0)`;

  // Pending count from inactive_memberships (org-level only, where rejected_at IS NULL)
  const pendingPart = `'m:pending', COALESCE((
    SELECT COUNT(*) FROM inactive_memberships im
    WHERE im.organization_id = o.id AND im.context_type = 'organization' AND im.rejected_at IS NULL
  ), 0)`;

  // Child entity counts: e:attachment, etc.
  const entityParts = childEntityTypes.map(
    (entityType) => `'e:${entityType}', COALESCE((
      SELECT COUNT(*) FROM ${sqlTableName(entityType)} e
      WHERE e.organization_id = o.id
    ), 0)`,
  );

  const jsonbPairs = [...roleParts, totalPart, pendingPart, ...entityParts].join(', ');

  // Aggregate memberships + entities per org → merge into context_counters
  // Filter memberships to context_type='organization' so sub-org memberships
  // (e.g. project-level) don't inflate org-level role counts.
  await db.execute(
    sql.raw(`
    INSERT INTO context_counters (context_key, counts, updated_at)
    SELECT
      o.id,
      jsonb_build_object(${jsonbPairs}),
      NOW()
    FROM organizations o
    LEFT JOIN memberships m ON m.organization_id = o.id AND m.context_type = 'organization'
    GROUP BY o.id
    ON CONFLICT (context_key) DO UPDATE SET
      counts = context_counters.counts || EXCLUDED.counts,
      updated_at = NOW()
  `),
  );

  // ── Phase 2: Sub-org context counters (e.g. project-level) ────────────
  // For each non-organization context type, count memberships (m:*) and
  // product entity children (e:*). Memberships are filtered by context_type
  // and the FK column linking to the sub-org entity (e.g. project_id).

  const contextTypes = hierarchy.contextTypes.filter((ct) => ct !== 'organization');

  for (const contextType of contextTypes) {
    const ctxTableName = sqlTableName(contextType);
    const idColumn: string = appConfig.entityIdColumnKeys[contextType];
    const fkColumn = idColumn.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

    // Membership role counts scoped to this context type
    const ctxRoles = hierarchy.getRoles(contextType);
    const ctxRoleParts = ctxRoles.map(
      (role) => `'m:${role}', COALESCE((
        SELECT COUNT(*) FROM memberships cm
        WHERE cm.${fkColumn} = ctx.id AND cm.context_type = '${contextType}' AND cm.role = '${role}'
      ), 0)`,
    );
    const ctxTotalPart = `'m:total', COALESCE((
      SELECT COUNT(*) FROM memberships cm
      WHERE cm.${fkColumn} = ctx.id AND cm.context_type = '${contextType}'
    ), 0)`;
    const ctxPendingPart = `'m:pending', COALESCE((
      SELECT COUNT(*) FROM inactive_memberships im
      WHERE im.${fkColumn} = ctx.id AND im.context_type = '${contextType}' AND im.rejected_at IS NULL
    ), 0)`;

    // Product entity children
    const children = hierarchy.getChildren(contextType).filter((c) => isProductEntity(c));
    const childParts = children.map(
      (childType) => `'e:${childType}', COALESCE((
        SELECT COUNT(*) FROM ${sqlTableName(childType)} ce
        WHERE ce.${fkColumn} = ctx.id
      ), 0)`,
    );

    const allParts = [...ctxRoleParts, ctxTotalPart, ctxPendingPart, ...childParts].join(', ');

    await db.execute(
      sql.raw(`
      INSERT INTO context_counters (context_key, counts, updated_at)
      SELECT
        ctx.id,
        jsonb_build_object(${allParts}),
        NOW()
      FROM ${ctxTableName} ctx
      ON CONFLICT (context_key) DO UPDATE SET
        counts = context_counters.counts || EXCLUDED.counts,
        updated_at = NOW()
    `),
    );
  }

  // ── Phase 3: Seq counters from MAX(seq_at) ───────────────────────────
  // Reconcile s:{type} keys so the sync engine sees correct high-water marks.
  // For each product entity type, compute MAX(seq_at) grouped by context key.

  for (const entityType of appConfig.productEntityTypes) {
    const tableName = sqlTableName(entityType);
    const parentType = hierarchy.getParent(entityType);
    const seqKey = `s:${entityType}`;

    if (parentType === null) {
      // Parentless entity → single public context key (e.g. 'public:page')
      const contextKey = `public:${entityType}`;

      await db.execute(
        sql.raw(`
        INSERT INTO context_counters (context_key, counts, updated_at)
        SELECT
          '${contextKey}',
          jsonb_build_object('${seqKey}', COALESCE(MAX(seq_at), 0)),
          NOW()
        FROM ${tableName}
        HAVING COUNT(*) > 0
        ON CONFLICT (context_key) DO UPDATE SET
          counts = context_counters.counts || EXCLUDED.counts,
          updated_at = NOW()
      `),
      );
    } else {
      // Parent-scoped entity → one row per parent context ID
      // Determine the FK column from the parent type (e.g. organization_id, project_id)
      const parentFkColumn = `${parentType.replace(/([A-Z])/g, '_$1').toLowerCase()}_id`;

      await db.execute(
        sql.raw(`
        INSERT INTO context_counters (context_key, counts, updated_at)
        SELECT
          t.${parentFkColumn},
          jsonb_build_object('${seqKey}', COALESCE(MAX(t.seq_at), 0)),
          NOW()
        FROM ${tableName} t
        GROUP BY t.${parentFkColumn}
        ON CONFLICT (context_key) DO UPDATE SET
          counts = context_counters.counts || EXCLUDED.counts,
          updated_at = NOW()
      `),
      );
    }
  }

  // Return total row count
  const [{ count }] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(contextCountersTable);

  return count;
};
