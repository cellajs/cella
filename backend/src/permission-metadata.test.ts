import { getTableColumns, getTableName } from 'drizzle-orm';
import { entityMetadata, membershipMetadata } from 'shared';
import { describe, expect, it } from 'vitest';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { entityTables } from '#/tables';

/**
 * The yjs relay can't import backend drizzle tables (it builds in isolation), so it relies on the
 * static `entityMetadata`/`membershipMetadata` registries in `shared`. These tests keep those
 * registries honest by asserting their table/column names match the live drizzle schema — if a
 * column is renamed or an editable entity added without updating the registry, this fails in CI.
 */
describe('permission metadata stays in sync with drizzle schema', () => {
  it('memberships table and columns match', () => {
    const cols = getTableColumns(membershipsTable);
    expect(membershipMetadata.table).toBe(getTableName(membershipsTable));
    expect(membershipMetadata.columns.contextType).toBe(cols.contextType.name);
    expect(membershipMetadata.columns.contextId).toBe(cols.contextId.name);
    expect(membershipMetadata.columns.role).toBe(cols.role.name);
    expect(membershipMetadata.columns.userId).toBe(cols.userId.name);
  });

  it('each registered entity matches its drizzle table', () => {
    for (const [entityType, meta] of Object.entries(entityMetadata)) {
      const table = entityTables[entityType as keyof typeof entityTables];
      expect(table, `no drizzle table registered for "${entityType}"`).toBeDefined();

      const cols = getTableColumns(table) as Record<string, { name: string }>;
      expect(meta.table, `table name for "${entityType}"`).toBe(getTableName(table));

      for (const [key, physical] of Object.entries(meta.columns)) {
        if (physical === undefined) continue;
        expect(cols[key]?.name, `column "${entityType}.${key}"`).toBe(physical);
      }
    }
  });
});
