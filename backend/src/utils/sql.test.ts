import { sql } from 'drizzle-orm';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getSeedDb } from '#/db/db';
import { textSearchFilter } from './sql';

const seedDb = getSeedDb();
const searchTable = pgTable('test_text_search_rows', { body: text('body').notNull() });
const rows = ['100% sure', 'a_b', 'c:\\dir', 'plain'];

const search = async (q: string) =>
  (await seedDb.select({ body: searchTable.body }).from(searchTable).where(textSearchFilter(searchTable.body, q))).map(({ body }) => body);

describe('textSearchFilter', () => {
  beforeAll(async () => {
    await seedDb.execute(sql`drop table if exists test_text_search_rows`);
    await seedDb.execute(sql`create table test_text_search_rows (body text not null)`);
    await seedDb.insert(searchTable).values(rows.map((body) => ({ body })));
  });

  afterAll(async () => {
    await seedDb.execute(sql`drop table if exists test_text_search_rows`);
  });

  it('must not let a search term with %, _ or \\ match more than its own text', async () => {
    expect(await search('%')).toEqual(['100% sure']);
    expect(await search('_')).toEqual(['a_b']);
    expect(await search('\\')).toEqual(['c:\\dir']);
  });
});
