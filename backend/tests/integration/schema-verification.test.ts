import { getTableName, sql } from 'drizzle-orm';
import { appConfig, entityIdColumnName, hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';
import { baseDb as adminDb } from '#/db/db';
import { entityTables } from '#/tables';

/** Product entities with a parent org (tasks, labels, attachments) have RLS and composite FK. */
const orgScopedProductTables = appConfig.productEntityTypes.map((t) => getTableName(entityTables[t as keyof typeof entityTables]));

const channelTables = appConfig.channelEntityTypes.map((t) => getTableName(entityTables[t as keyof typeof entityTables]));

const tableOf = (entityType: string) => getTableName(entityTables[entityType as keyof typeof entityTables]);
const subOrganizationTypes = appConfig.channelEntityTypes.filter((type) => type !== 'organization');

/** The tables that spread `membershipChannelColumns`. */
const membershipChannelTables = ['memberships', 'invitations', 'lti_resource_links', 'lti_contexts'];

type ChannelReference = [table: string, column: string, channelTable: string];
const referenceTo = (table: string, channelType: string): ChannelReference => [table, entityIdColumnName(channelType), tableOf(channelType)];

/** Every column that names a channel below the organization: product and channel ancestors, membership channel columns. */
const channelReferenceColumns: ChannelReference[] = [
  ...[...appConfig.productEntityTypes, ...subOrganizationTypes].flatMap((entityType) =>
    hierarchy
      .getOrderedAncestors(entityType)
      .filter((type) => type !== 'organization')
      .map((type) => referenceTo(tableOf(entityType), type)),
  ),
  ...membershipChannelTables.flatMap((table) => subOrganizationTypes.map((type) => referenceTo(table, type))),
];

function getRows<T = Record<string, unknown>>(result: any): T[] {
  if (Array.isArray(result)) return result;
  if (result?.rows && Array.isArray(result.rows)) return result.rows;
  return [];
}

// The migration's verify block (scripts/migrations/99-verify) asserts RLS, ownership, the tenant policy, grants and
// triggers. These checks cover what it leaves out: channel tables stay outside RLS, the composite tenant FK holds on
// product tables, and every column naming a channel below the organization is keyed with the tenant.
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
    it.each(orgScopedProductTables)('should have composite FK (tenant_id, organization_id) → organizations on %s', async (tableName) => {
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
    });

    // Any other key on the column fails the check: a key by id alone beside the composite one lets a row name another tenant's channel.
    it.each(channelReferenceColumns)('should key %s.%s to %s by (tenant_id, id) alone, cascading', async (tableName, column, channelTable) => {
      const rows = getRows<{ columns: string[]; target: string; on_delete: string }>(
        await adminDb.execute(sql`
            SELECT keys.columns, con.confrelid::regclass::text AS target, con.confdeltype::text AS on_delete
            FROM pg_constraint con
            CROSS JOIN LATERAL (
              SELECT array_agg(a.attname::text) AS columns FROM pg_attribute a WHERE a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
            ) keys
            WHERE con.contype = 'f' AND con.conrelid = to_regclass(${tableName}) AND ${column} = ANY(keys.columns)
          `),
      );

      const keys = rows.map(({ columns, ...key }) => ({ ...key, columns: [...columns].sort() }));
      expect(keys, `Keys on ${tableName}.${column}`).toEqual([{ columns: [column, 'tenant_id'].sort(), target: channelTable, on_delete: 'c' }]);
    });
  });
});
