import { getTableName, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import { baseDb as adminDb } from '#/db/db';
import { rlsPolicyContract } from '#/db/rls-helpers';
import { entityTables } from '#/tables';
import { classifyRlsTables } from '../../scripts/migrations/10-rls.migration';

/** Product entities with a parent org (tasks, labels, attachments) have RLS and composite FK. */
const orgScopedProductTables = appConfig.productEntityTypes.map((t) =>
  getTableName(entityTables[t as keyof typeof entityTables]),
);

const channelTables = appConfig.channelEntityTypes.map((t) =>
  getTableName(entityTables[t as keyof typeof entityTables]),
);

const allProductTables = appConfig.productEntityTypes.map((t) =>
  getTableName(entityTables[t as keyof typeof entityTables]),
);

/** Tables with RLS enabled, never forced (org-scoped product entities + yjs_documents) */
const rlsTableNames = [...orgScopedProductTables, 'yjs_documents'];

function getRows<T = Record<string, unknown>>(result: any): T[] {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
}

// Verifies entity-table security infrastructure from PostgreSQL system catalogs.
describe('Schema verification', () => {
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

  // Migration-outcome checks: they inspect the schema the migration produced and never repair it
  // (the global setup provisions the roles before migrating and refuses a degraded volume).
  describe('RLS runtime configuration', () => {
    // Enabled, not forced: the owner (admin_role) bypasses the policies natively, so the CDC worker and
    // the admin connection need no BYPASSRLS attribute (managed providers cannot grant it).
    describe('ROW LEVEL SECURITY enabled, not forced', () => {
      it.each(rlsTableNames)('should have RLS enabled and not forced on %s', async (tableName) => {
        const rows = getRows<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
          await adminDb.execute(sql`
            SELECT relrowsecurity, relforcerowsecurity
            FROM pg_class
            WHERE relname = ${tableName}
          `),
        );
        expect(rows.length, `Table ${tableName} not found in pg_class`).toBe(1);
        expect(rows[0].relrowsecurity, `RLS not enabled on ${tableName}`).toBe(true);
        expect(rows[0].relforcerowsecurity, `RLS must not be forced on ${tableName} (owner bypass)`).toBe(false);
      });

      it.each(channelTables)('should NOT have forced RLS on %s (app-layer isolation)', async (tableName) => {
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

  // ── Migration verifier contract (same sources as 99-verify) ───────────

  describe('Runtime role stays RLS-subject', () => {
    it('runtime_role has neither BYPASSRLS nor SUPERUSER', async () => {
      const rows = getRows<{ rolbypassrls: boolean; rolsuper: boolean }>(
        await adminDb.execute(sql`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'runtime_role'`),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].rolbypassrls).toBe(false);
      expect(rows[0].rolsuper).toBe(false);
    });
  });

  describe('Policy contract', () => {
    it.each(rlsTableNames)('%s carries exactly the four contract policies', async (tableName) => {
      const rows = getRows<{
        polname: string;
        polcmd: string;
        polpermissive: boolean;
        using: string | null;
        check: string | null;
      }>(
        await adminDb.execute(sql`
          SELECT p.polname, p.polcmd, p.polpermissive,
                 pg_get_expr(p.polqual, p.polrelid) AS using,
                 pg_get_expr(p.polwithcheck, p.polrelid) AS check
          FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
          WHERE c.relname = ${tableName} AND c.relnamespace = 'public'::regnamespace
          ORDER BY p.polname
        `),
      );
      const contract = Object.values(rlsPolicyContract(tableName));
      expect(rows.map((r) => r.polname).sort()).toEqual(contract.map((c) => c.name).sort());
      for (const policy of contract) {
        const row = rows.find((r) => r.polname === policy.name);
        expect(row?.polcmd, policy.name).toBe(policy.command);
        expect(row?.polpermissive, policy.name).toBe(true);
        if (policy.expression === 'tenant') {
          expect(row?.using, policy.name).toContain('app.tenant_id');
          expect(row?.using, policy.name).toContain('tenant_id)::text = current_setting');
        } else {
          expect(row?.check ?? row?.using, policy.name).toBe('true');
        }
      }
    });
  });

  describe('Grants per classification', () => {
    const { fullCrudTables, readOnlyTables } = classifyRlsTables();
    const privilegesOf = async (tableName: string) => {
      const table = `public.${tableName}`;
      const rows = getRows<{ s: boolean; i: boolean; u: boolean; d: boolean }>(
        await adminDb.execute(sql`
          SELECT has_table_privilege('runtime_role', ${table}, 'SELECT') AS s,
                 has_table_privilege('runtime_role', ${table}, 'INSERT') AS i,
                 has_table_privilege('runtime_role', ${table}, 'UPDATE') AS u,
                 has_table_privilege('runtime_role', ${table}, 'DELETE') AS d
        `),
      );
      return rows[0];
    };

    it.each([...rlsTableNames, ...fullCrudTables])(
      'runtime_role has SELECT, INSERT, UPDATE, DELETE on %s',
      async (t) => {
        expect(await privilegesOf(t)).toEqual({ s: true, i: true, u: true, d: true });
      },
    );

    it.each(readOnlyTables)('runtime_role has SELECT only on %s', async (t) => {
      expect(await privilegesOf(t)).toEqual({ s: true, i: false, u: false, d: false });
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
