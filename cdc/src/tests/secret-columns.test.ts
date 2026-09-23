import { readdirSync } from 'node:fs';
import path from 'node:path';
import { getColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { secretColumnPattern, secretColumns, secretLookingColumns } from '#/db/secret-columns';

/** Every table in the schema, from the same files drizzle-kit reads (`backend/src/modules/** /*-db.ts`). */
const modulesDir = path.resolve(import.meta.dirname, '../../../backend/src/modules');
const dbFiles = readdirSync(modulesDir, { recursive: true, encoding: 'utf8' }).filter((file) =>
  file.endsWith('-db.ts'),
);

const allTables = new Map<string, PgTable>();

beforeAll(async () => {
  for (const file of dbFiles) {
    const mod = (await import(path.join(modulesDir, file))) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (is(value, PgTable)) allTables.set(getTableName(value), value);
    }
  }
});

const listed = (registry: Record<string, readonly string[]>, table: string, column: string): boolean =>
  registry[table]?.includes(column) ?? false;

describe('secretColumns registry', () => {
  it('sees the whole schema', () => {
    expect(allTables.size).toBeGreaterThan(20);
    for (const name of ['api_keys', 'sessions', 'users', 'attachments']) expect(allTables.has(name)).toBe(true);
  });

  it('lists every column in the schema whose name ends like a secret, or explains why it is not one', () => {
    const missing: string[] = [];
    for (const [table, pgTable] of allTables) {
      for (const column of Object.keys(getColumns(pgTable))) {
        if (!secretColumnPattern.test(column)) continue;
        if (listed(secretColumns, table, column) || listed(secretLookingColumns, table, column)) continue;
        missing.push(`${table}.${column}`);
      }
    }
    expect(missing, 'add to secretColumns or secretLookingColumns in backend/src/db/secret-columns.ts').toEqual([]);
  });

  it('names only tables and columns that exist', () => {
    for (const registry of [secretColumns, secretLookingColumns]) {
      for (const [table, columns] of Object.entries(registry)) {
        const pgTable = allTables.get(table);
        expect(pgTable, `table ${table}`).toBeDefined();
        if (!pgTable) continue;
        const existing = Object.keys(getColumns(pgTable));
        for (const column of columns) expect(existing, `${table}.${column}`).toContain(column);
      }
    }
  });

  it('never lists a column as both secret and merely secret-looking', () => {
    const both: string[] = [];
    for (const [table, columns] of Object.entries(secretColumns)) {
      for (const column of columns) if (listed(secretLookingColumns, table, column)) both.push(`${table}.${column}`);
    }
    expect(both).toEqual([]);
  });
});
