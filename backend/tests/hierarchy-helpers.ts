import { sql } from 'drizzle-orm';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';

/**
 * Config-adaptive seeding for a product entity's ancestor context chain, derived from the app's
 * real hierarchy via `buildTestEntityHierarchyPlan`. A fork whose attachment lives directly under
 * organization seeds nothing; a fork with `organization → project → attachment` seeds a project —
 * from the same test source. Mirrors the inline pattern in `tests/integration/rls-security.test.ts`.
 */

const quoteIdent = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/** Minimal shape needed to run raw SQL — satisfied by both `baseDb` and the admin connection. */
type ExecutableDb = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

/** Insert every intermediate context row the plan declares (root context is assumed to exist). */
export async function seedEntityHierarchy(
  db: ExecutableDb,
  plan: TestEntityHierarchyPlan,
  opts: { tenantId: string; createdBy: string; slugPrefix: string },
): Promise<void> {
  for (const row of plan.seedChannelRows) {
    await db.execute(sql`
      INSERT INTO ${sql.raw(quoteIdent(row.tableName))}
        (id, tenant_id, entity_type, name, slug, created_by, ${sql.raw(quoteIdent(row.parentColumnName))})
      VALUES (
        ${row.id}, ${opts.tenantId}, ${row.channelType}, ${`${opts.slugPrefix} ${row.channelType}`},
        ${`${opts.slugPrefix}-${row.channelType}-${row.id.slice(0, 8)}`}, ${opts.createdBy}, ${row.parentId}
      )
      ON CONFLICT (id) DO NOTHING
    `);
  }
}

/** Delete seeded context rows, children before parents. */
export async function cleanupEntityHierarchy(db: ExecutableDb, ...plans: TestEntityHierarchyPlan[]): Promise<void> {
  for (const row of plans.flatMap((plan) => plan.seedChannelRows).reverse()) {
    await db.execute(sql`DELETE FROM ${sql.raw(quoteIdent(row.tableName))} WHERE id = ${row.id}`);
  }
}
