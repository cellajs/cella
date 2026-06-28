import { getColumns, getTableName } from 'drizzle-orm';
import { appConfig, toColumnName, toTableName } from 'shared';
import { describe, expect, it } from 'vitest';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { entityTables } from '#/tables';

/**
 * The yjs relay can't import backend drizzle tables (it builds in isolation), so it derives physical
 * table/column names from `toTableName`/`toColumnName` conventions in `shared`. These tests keep the
 * conventions honest by asserting they match the live drizzle schema for every entity table — so a
 * fork whose table/column naming diverges fails CI here instead of silently denying edits at runtime.
 */
describe('yjs schema-naming conventions match the drizzle schema', () => {
  // Logical column keys the relay's permission SQL reads (id, ownership, tenant, ancestor scopes).
  const readKeys = ['id', 'createdBy', 'tenantId', ...Object.values(appConfig.entityIdColumnKeys)];

  it('memberships table and the columns the engine reads', () => {
    const cols = getColumns(membershipsTable) as Record<string, { name: string }>;
    expect(toTableName('membership')).toBe(getTableName(membershipsTable));
    for (const key of ['contextType', 'contextId', 'role', 'userId']) {
      expect(cols[key]?.name, `memberships.${key}`).toBe(toColumnName(key));
    }
  });

  it('each entity table name and read-columns follow the convention', () => {
    for (const [entityType, table] of Object.entries(entityTables)) {
      expect(toTableName(entityType), `table name for "${entityType}"`).toBe(getTableName(table));

      const cols = getColumns(table) as Record<string, { name: string }>;
      for (const key of readKeys) {
        // Only columns the table actually has matter — the relay probes presence at runtime.
        if (cols[key]) expect(cols[key].name, `column "${entityType}.${key}"`).toBe(toColumnName(key));
      }
    }
  });
});
