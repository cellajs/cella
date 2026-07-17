import { getColumns, getTableName } from 'drizzle-orm';
import { appConfig, toColumnName, toTableName } from 'shared';
import { describe, expect, it } from 'vitest';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { entityTables } from '#/tables';

// The Yjs relay derives physical names without importing backend tables. These assertions
// keep shared naming conventions aligned with the live Drizzle schema.
describe('yjs schema-naming conventions match the drizzle schema', () => {
  // Logical column keys the relay's permission SQL reads (id, ownership, tenant, ancestor scopes).
  const readKeys = ['id', 'createdBy', 'tenantId', ...Object.values(appConfig.entityIdColumnKeys)];

  it('memberships table and the columns the engine reads', () => {
    const cols = getColumns(membershipsTable) as Record<string, { name: string }>;
    expect(toTableName('membership')).toBe(getTableName(membershipsTable));
    for (const key of ['channelType', 'channelId', 'role', 'userId']) {
      expect(cols[key]?.name, `memberships.${key}`).toBe(toColumnName(key));
    }
  });

  it('snake_cases camelCase entity types (multi-word forks)', () => {
    // No cella entity type is camelCase, but forks add them (e.g. courseSection);
    // the yjs relay would derive a wrong physical name without snake_casing here.
    expect(toTableName('courseSection')).toBe('course_sections');
    expect(toTableName('task')).toBe('tasks');
  });

  it('each entity table name and read-columns follow the convention', () => {
    for (const [entityType, table] of Object.entries(entityTables)) {
      expect(toTableName(entityType), `table name for "${entityType}"`).toBe(getTableName(table));

      const cols = getColumns(table) as Record<string, { name: string }>;
      for (const key of readKeys) {
        // Only columns the table actually has matter; the relay probes presence at runtime.
        if (cols[key]) expect(cols[key].name, `column "${entityType}.${key}"`).toBe(toColumnName(key));
      }
    }
  });
});
