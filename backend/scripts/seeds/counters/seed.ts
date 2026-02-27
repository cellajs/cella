import { getTableName } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { appConfig, hierarchy, isProductEntity, roles } from 'shared';
import { migrationDb } from '#/db/db';
import { contextCountersTable } from '#/db/schema/context-counters';
import { entityTables } from '#/table-config';
import { startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';

// Seed scripts use admin connection (migrationDb) for privileged operations
const db = migrationDb;

const isProduction = process.env.NODE_ENV === 'production';

/** Resolve entity type → SQL table name via Drizzle (e.g. 'task' → 'tasks') */
const sqlTableName = (entityType: string) => getTableName(entityTables[entityType as keyof typeof entityTables]);

/**
 * Backfill context_counters from current membership + entity data.
 *
 * Phase 1 – Organization-level counters:
 *   - memberships: role breakdown + total per organization
 *   - inactive_memberships: pending (not rejected) per organization
 *   - child entities (e.g. attachments): count per organization
 *
 * Phase 2 – Sub-org context counters (e.g. project-level):
 *   For each non-organization context type that parents product entities,
 *   counts those children per context row. This ensures getUnseenCounts
 *   (which looks up by parent context, e.g. projectId) finds the totals.
 *
 * Upserts into context_counters using ON CONFLICT DO UPDATE
 * so it's safe to run multiple times (idempotent).
 */
export const countersSeed = async () => {
  const spinner = startSpinner('Seeding context counters...');

  if (isProduction) {
    spinner.fail('Not allowed in production.');
    return;
  }

  if (!db) {
    spinner.fail('DATABASE_ADMIN_URL required for seeding');
    return;
  }

  // Check if counters already exist
  const existing = await db.select({ key: contextCountersTable.contextKey }).from(contextCountersTable).limit(1);
  if (existing.length > 0) {
    warnSpinner('Context counters table not empty → skip seeding');
    return;
  }

  // ── Phase 1: Organization-level counters ──────────────────────────────

  const allRoles = roles.all;
  const childEntityTypes = hierarchy.getChildren('organization');

  // Membership role counts: m:admin, m:member, m:total
  const roleParts = allRoles.map((role) => `'m:${role}', COALESCE(SUM(CASE WHEN m.role = '${role}' THEN 1 ELSE 0 END), 0)`);
  const totalPart = `'m:total', COALESCE(COUNT(m.id), 0)`;

  // Pending count from inactive_memberships (where rejected_at IS NULL)
  const pendingPart = `'m:pending', COALESCE((
    SELECT COUNT(*) FROM inactive_memberships im
    WHERE im.organization_id = o.id AND im.rejected_at IS NULL
  ), 0)`;

  // Child entity counts: e:attachment, etc.
  const entityParts = childEntityTypes.map(
    (entityType) => `'e:${entityType}', COALESCE((
      SELECT COUNT(*) FROM ${sqlTableName(entityType)} e
      WHERE e.organization_id = o.id
    ), 0)`,
  );

  const jsonbPairs = [...roleParts, totalPart, pendingPart, ...entityParts].join(', ');

  // Single query: aggregate memberships + entities per org → upsert into context_counters
  await db.execute(sql.raw(`
    INSERT INTO context_counters (context_key, seq, m_seq, counts, updated_at)
    SELECT
      o.id,
      0,
      0,
      jsonb_build_object(${jsonbPairs}),
      NOW()
    FROM organizations o
    LEFT JOIN memberships m ON m.organization_id = o.id
    GROUP BY o.id
    ON CONFLICT (context_key) DO UPDATE SET
      counts = EXCLUDED.counts,
      updated_at = NOW()
  `));

  // ── Phase 2: Sub-org context counters (e.g. project-level) ────────────
  // For each non-organization context type that has product entity children,
  // count those children and create a context_counters row keyed by the context ID.

  const contextTypes = hierarchy.contextTypes.filter((ct) => ct !== 'organization');

  for (const contextType of contextTypes) {
    // Get product entity children of this context type
    const children = hierarchy.getChildren(contextType).filter((c) => isProductEntity(c));
    if (children.length === 0) continue;

    const ctxTableName = sqlTableName(contextType);
    const idColumn = appConfig.entityIdColumnKeys[contextType as keyof typeof appConfig.entityIdColumnKeys];
    // Convert camelCase to snake_case for SQL column reference (e.g. projectId → project_id)
    const fkColumn = idColumn.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

    const childParts = children.map(
      (childType) => `'e:${childType}', COALESCE((
        SELECT COUNT(*) FROM ${sqlTableName(childType)} ce
        WHERE ce.${fkColumn} = ctx.id
      ), 0)`,
    );

    await db.execute(sql.raw(`
      INSERT INTO context_counters (context_key, seq, m_seq, counts, updated_at)
      SELECT
        ctx.id,
        0,
        0,
        jsonb_build_object(${childParts.join(', ')}),
        NOW()
      FROM ${ctxTableName} ctx
      ON CONFLICT (context_key) DO UPDATE SET
        counts = context_counters.counts || EXCLUDED.counts,
        updated_at = NOW()
    `));
  }

  // Count how many rows were inserted
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(contextCountersTable);

  succeedSpinner(`Seeded context counters for ${count} contexts`);
};
