import { getColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { entityTables, redactedColumns, resourceTables, sensitiveColumnPattern } from '#/tables';
import { tableRegistry } from '../table-registry';
import type { CdcRowData, TableMeta } from '../types';
import { compactRowData } from '../utils/compact-row-data';

type TrackedTable =
  | (typeof entityTables)[keyof typeof entityTables]
  | (typeof resourceTables)[keyof typeof resourceTables];

const trackedTables: Record<string, TrackedTable> = { ...entityTables, ...resourceTables };

const listedFor = (type: string): ReadonlySet<string> =>
  new Set((redactedColumns as Partial<Record<string, readonly string[]>>)[type] ?? []);

const metaFor = (tableName: string): TableMeta => {
  const meta = tableRegistry.get(tableName);
  if (!meta) throw new Error(`${tableName} is not a tracked table`);
  return meta;
};

describe('redactedColumns', () => {
  it('lists every secret-looking column of every tracked table', () => {
    const missing: string[] = [];
    for (const [type, table] of Object.entries(trackedTables)) {
      const listed = listedFor(type);
      for (const key of Object.keys(getColumns(table))) {
        if (sensitiveColumnPattern.test(key) && !listed.has(key)) missing.push(`${type}.${key}`);
      }
    }
    expect(missing, 'add these to redactedColumns in backend/src/tables.ts (or rename the column)').toEqual([]);
  });

  it('names only columns that exist on the table', () => {
    for (const [type, keys] of Object.entries(redactedColumns)) {
      const columns = Object.keys(getColumns(trackedTables[type]));
      for (const key of keys) expect(columns, `${type}.${key}`).toContain(key);
    }
  });
});

describe('compactRowData', () => {
  it('strips the api_key hash and keeps the rest', () => {
    const row = { id: 'k1', prefix: 'app_sk_live_ab', last4: '1234', hash: 'sha256' } as unknown as CdcRowData;
    expect(compactRowData(metaFor('api_keys'), row)).toEqual({ id: 'k1', prefix: 'app_sk_live_ab', last4: '1234' });
  });

  it('strips the oauth_client secret hash', () => {
    const row = { id: 'c1', name: 'Portfolio', secretHash: 'sha256' } as unknown as CdcRowData;
    expect(compactRowData(metaFor('oauth_clients'), row)).toEqual({ id: 'c1', name: 'Portfolio' });
  });

  it('leaves a type without redacted columns untouched', () => {
    const row = { id: 'm1', role: 'admin', hash: 'not a secret column here' } as unknown as CdcRowData;
    expect(compactRowData(metaFor('memberships'), row)).toEqual(row);
  });
});
