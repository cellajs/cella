import { getTableName, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import { baseDb as adminDb } from '#/db/db';
import { entityTables } from '#/tables';

/** Product entities with a parent org (tasks, labels, attachments) have RLS and composite FK. */
const orgScopedProductTables = appConfig.productEntityTypes.map((t) =>
  getTableName(entityTables[t as keyof typeof entityTables]),
);

const channelTables = appConfig.channelEntityTypes.map((t) =>
  getTableName(entityTables[t as keyof typeof entityTables]),
);

function getRows<T = Record<string, unknown>>(result: any): T[] {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
}

// The migration's own verify block (scripts/migrations/99-verify) asserts RLS, ownership, the policy contract, grants
// and triggers on the RLS tables and aborts the migration otherwise. These checks cover what it leaves out: channel
// tables stay outside RLS (their isolation is the guards'), and the composite tenant FK holds on product tables.
describe('Schema verification', () => {
  describe('Channel entities stay outside RLS (app-layer isolation)', () => {
    it.each(channelTables)('should NOT have forced RLS on %s', async (tableName) => {
      const rows = getRows<{ relforcerowsecurity: boolean }>(
        await adminDb.execute(sql`
          SELECT relforcerowsecurity
          FROM pg_class
          WHERE relname = ${tableName}
        `),
      );
      expect(rows.length).toBe(1);
      expect(rows[0].relforcerowsecurity, `Unexpected FORCE RLS on ${tableName}`).toBe(false);
    });

    it.each(channelTables)('should NOT have RLS policies on %s', async (tableName) => {
      const rows = getRows<{ polname: string }>(
        await adminDb.execute(sql`
          SELECT pol.polname
          FROM pg_policy pol
          JOIN pg_class c ON pol.polrelid = c.oid
          WHERE c.relname = ${tableName}
        `),
      );
      expect(rows.length, `Unexpected RLS policies on ${tableName}: ${rows.map((r) => r.polname).join(', ')}`).toBe(0);
    });
  });

  describe('Composite foreign keys (tenant_id, organization_id)', () => {
    it.each(orgScopedProductTables)(
      'should have composite FK (tenant_id, organization_id) → organizations on %s',
      async (tableName) => {
        const rows = getRows<{ constraint_name: string; column_name: string }>(
          await adminDb.execute(sql`
            SELECT kcu.constraint_name, kcu.column_name
            FROM information_schema.key_column_usage kcu
            JOIN information_schema.table_constraints tc
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.referential_constraints rc
              ON rc.constraint_name = tc.constraint_name
            JOIN information_schema.key_column_usage kcu2
              ON kcu2.constraint_name = rc.unique_constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND kcu.table_name = ${tableName}
              AND kcu2.table_name = 'organizations'
          `),
        );

        const columns = rows.map((r) => r.column_name);
        expect(columns, `Missing composite FK on ${tableName}`).toContain('tenant_id');
        expect(columns, `Missing composite FK on ${tableName}`).toContain('organization_id');
      },
    );
  });
});
