import { sql } from 'drizzle-orm';
import type { TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';

const quoteIdent = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/** Minimal shape needed to run raw SQL, satisfied by both `baseDb` and the admin connection. */
type ExecutableDb = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

/** Insert every intermediate context row the plan declares (the organization row is assumed to exist). */
export async function seedEntityHierarchy(
  db: ExecutableDb,
  plan: TestEntityHierarchyPlan,
  opts: { tenantId: string; createdBy: string; slugPrefix: string },
): Promise<void> {
  for (const row of plan.seedChannelRows) {
    // Every ancestor id column is NOT NULL on channel tables, so insert all of them.
    const ancestorNames = sql.join(
      row.ancestorColumns.map((column) => sql.raw(quoteIdent(column.columnName))),
      sql`, `,
    );
    const ancestorValues = sql.join(
      row.ancestorColumns.map((column) => sql`${column.id}`),
      sql`, `,
    );
    await db.execute(sql`
      INSERT INTO ${sql.raw(quoteIdent(row.tableName))}
        (id, tenant_id, entity_type, name, slug, created_by, ${ancestorNames})
      VALUES (
        ${row.id}, ${opts.tenantId}, ${row.channelType}, ${`${opts.slugPrefix} ${row.channelType}`},
        ${`${opts.slugPrefix}-${row.channelType}-${row.id.slice(0, 8)}`}, ${opts.createdBy}, ${ancestorValues}
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
