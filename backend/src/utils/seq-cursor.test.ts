import { sql } from 'drizzle-orm';
import { pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDb } from '#/db/db';
import { parseSeqCursor, pathPrefixFilter } from './seq-cursor';

const table = pgTable('test_path_filter_rows', {
  id: varchar('id').primaryKey(),
  path: text('path'),
});

describe('parseSeqCursor', () => {
  it('parses open and bounded forms, rejects malformed input', () => {
    expect(parseSeqCursor('51')).toEqual({ gte: 51 });
    expect(parseSeqCursor('51,150')).toEqual({ gte: 51, lte: 150 });
    expect(parseSeqCursor('')).toBeUndefined();
    expect(parseSeqCursor('a,b')).toBeUndefined();
    expect(parseSeqCursor('1,2,3')).toBeUndefined();
  });
});

describe('pathPrefixFilter (live SQL)', () => {
  beforeAll(async () => {
    await seedDb.execute(
      sql.raw(`
        create table test_path_filter_rows (id varchar primary key, path text);
        insert into test_path_filter_rows (id, path) values
          ('node',       'o1/c1'),
          ('descendant', 'o1/c1/p9'),
          ('lookalike',  'o1/c11'),
          ('sibling',    'o1/c2'),
          ('wildcarded', 'o1/c%_1/x');
      `),
    );
  });

  afterAll(async () => {
    await seedDb.execute(sql.raw('drop table if exists test_path_filter_rows'));
  });

  const idsFor = async (prefix: string): Promise<string[]> => {
    const filters = pathPrefixFilter(table.path, prefix);
    const rows = await seedDb.select({ id: table.id }).from(table).where(filters[0]);
    return rows.map((r) => r.id).sort();
  };

  it('is empty without a prefix', () => {
    expect(pathPrefixFilter(table.path, undefined)).toEqual([]);
    expect(pathPrefixFilter(table.path, '')).toEqual([]);
  });

  it('matches the node itself and true descendants, never lookalikes or siblings', async () => {
    expect(await idsFor('o1/c1')).toEqual(['descendant', 'node']);
  });

  it('escapes LIKE wildcards in the prefix (no wildcard injection)', async () => {
    // A literal `%`/`_` prefix must only match its literal descendants.
    expect(await idsFor('o1/c%_1')).toEqual(['wildcarded']);
    // And a wildcard-free prefix must not match the wildcarded row.
    expect(await idsFor('o1/c')).toEqual([]);
  });
});
