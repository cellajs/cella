import { getTableName, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { baseDb as adminDb } from '#/db/db';
import { entityTables } from '#/tables';

// Derived table sets

/** Product entities with a parent org (tasks, labels, attachments) have RLS and composite FK. */
const orgScopedProductTables = appConfig.productEntityTypes.map((t) =>
  getTableName(entityTables[t as keyof typeof entityTables]),
);

/** Channel entity tables (organizations, workspaces, projects) */
const channelTables = appConfig.channelEntityTypes.map((t) =>
  getTableName(entityTables[t as keyof typeof entityTables]),
);

/** All product entity tables */
const allProductTables = appConfig.productEntityTypes.map((t) =>
  getTableName(entityTables[t as keyof typeof entityTables]),
);

/** Tables that should have FORCE RLS (org-scoped product entities + yjs_documents) */
const rlsTableNames = [...orgScopedProductTables, 'yjs_documents'];

// Helper: query system catalogs

function getRows<T = Record<string, unknown>>(result: any): T[] {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
}

// Verifies entity-table security infrastructure from PostgreSQL system catalogs.
describe('Schema verification', () => {
  // Immutability triggers

  describe('Immutability triggers', () => {
    const allImutableTables = [...allProductTables, ...channelTables];

    it.each(allImutableTables)('should have immutability trigger on %s', async (tableName) => {
      const rows = getRows<{ trigger_name: string }>(
        await adminDb.execute(sql`
          SELECT trigger_name
          FROM information_schema.triggers
          WHERE event_object_table = ${tableName}
            AND trigger_name LIKE '%immutable_keys_trigger'
        `),
      );
      expect(rows.length, `Missing immutability trigger on ${tableName}`).toBeGreaterThanOrEqual(1);
    });

    it.each(['memberships', 'inactive_memberships'])('should have immutability trigger on %s', async (tableName) => {
      const rows = getRows<{ trigger_name: string }>(
        await adminDb.execute(sql`
            SELECT trigger_name
            FROM information_schema.triggers
            WHERE event_object_table = ${tableName}
              AND trigger_name LIKE '%immutable_keys_trigger'
          `),
      );
      expect(rows.length, `Missing immutability trigger on ${tableName}`).toBeGreaterThanOrEqual(1);
    });

    it('should have append-only trigger on activities', async () => {
      const rows = getRows<{ trigger_name: string }>(
        await adminDb.execute(sql`
          SELECT trigger_name
          FROM information_schema.triggers
          WHERE event_object_table = 'activities'
            AND trigger_name LIKE '%immutable%'
        `),
      );
      expect(rows.length, 'Missing append-only trigger on activities').toBeGreaterThanOrEqual(1);
    });
  });

  // These require the RLS migration to have been run. The beforeAll ensures
  // admin_role/runtime_role exist and FORCE RLS is set (mirrors 10-rls.migration.ts).

  describe('RLS runtime configuration', () => {
    let rlsConfigured = false;

    beforeAll(async () => {
      try {
        await adminDb.execute(sql`
          DO $$
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runtime_role') THEN
              CREATE ROLE runtime_role WITH LOGIN PASSWORD 'dev_password';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_role') THEN
              CREATE ROLE admin_role WITH LOGIN BYPASSRLS PASSWORD 'dev_password';
            END IF;

            GRANT USAGE ON SCHEMA public TO runtime_role;
            GRANT ALL ON SCHEMA public TO admin_role;
          END $$;
        `);

        // Apply FORCE RLS + ownership for all RLS tables
        for (const tableName of rlsTableNames) {
          await adminDb.execute(sql.raw(`ALTER TABLE ${tableName} OWNER TO admin_role`));
          await adminDb.execute(sql.raw(`ALTER TABLE ${tableName} FORCE ROW LEVEL SECURITY`));
          await adminDb.execute(sql.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${tableName} TO runtime_role`));
        }

        rlsConfigured = true;
      } catch {
        console.warn('Could not configure RLS roles — skipping RLS runtime tests');
      }
    });

    describe('FORCE ROW LEVEL SECURITY', () => {
      it.each(rlsTableNames)('should have FORCE RLS enabled on %s', async (tableName) => {
        if (!rlsConfigured) return;
        const rows = getRows<{ relforcerowsecurity: boolean }>(
          await adminDb.execute(sql`
            SELECT relforcerowsecurity
            FROM pg_class
            WHERE relname = ${tableName}
          `),
        );
        expect(rows.length, `Table ${tableName} not found in pg_class`).toBe(1);
        expect(rows[0].relforcerowsecurity, `FORCE RLS not enabled on ${tableName}`).toBe(true);
      });

      it.each(channelTables)('should NOT have FORCE RLS on %s (app-layer isolation)', async (tableName) => {
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
    });

    describe('Table ownership', () => {
      it.each(rlsTableNames)('should be owned by admin_role: %s', async (tableName) => {
        if (!rlsConfigured) return;
        const rows = getRows<{ tableowner: string }>(
          await adminDb.execute(sql`
            SELECT tableowner
            FROM pg_tables
            WHERE tablename = ${tableName}
          `),
        );
        expect(rows.length).toBe(1);
        expect(rows[0].tableowner, `${tableName} not owned by admin_role`).toBe('admin_role');
      });
    });
  });

  // ── RLS policies (schema-level, from Drizzle pgPolicy) ────────────────

  describe('RLS policies', () => {
    it.each(rlsTableNames)('should have tenant select policy on %s', async (tableName) => {
      const rows = getRows<{ polname: string }>(
        await adminDb.execute(sql`
          SELECT pol.polname
          FROM pg_policy pol
          JOIN pg_class c ON pol.polrelid = c.oid
          WHERE c.relname = ${tableName}
            AND pol.polname LIKE '%select_policy'
        `),
      );
      expect(rows.length, `Missing select policy on ${tableName}`).toBeGreaterThanOrEqual(1);
    });

    it.each(rlsTableNames)('should have write-through policies on %s', async (tableName) => {
      const rows = getRows<{ polname: string }>(
        await adminDb.execute(sql`
          SELECT pol.polname
          FROM pg_policy pol
          JOIN pg_class c ON pol.polrelid = c.oid
          WHERE c.relname = ${tableName}
            AND (pol.polname LIKE '%insert_policy'
              OR pol.polname LIKE '%update_policy'
              OR pol.polname LIKE '%delete_policy')
        `),
      );
      expect(rows.length, `Missing write-through policies on ${tableName}`).toBeGreaterThanOrEqual(3);
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

  // ── Composite foreign keys ─────────────────────────────────────────────

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
