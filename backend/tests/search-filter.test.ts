import { sql } from 'drizzle-orm';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { foldText, matchesTerms, parseTerms } from 'shared/utils/text-match';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getSeedDb } from '#/db/db';
import { searchFilter } from '#/utils/sql';

const samples = pgTable('search_filter_samples', { id: integer().primaryKey(), name: text().notNull(), email: text() });

const rows = [
  { id: 1, name: 'Renée Dubois', email: 'renee@example.com' },
  { id: 2, name: 'Wunsch - Strosin', email: null },
  { id: 3, name: 'Conor Kling', email: 'conor_kling@hotmail.com' },
  { id: 4, name: 'Rapid design', email: 'rapid@gmail.com' },
  { id: 5, name: 'API tools', email: 'api@gmail.com' },
  { id: 6, name: '100% sure', email: null },
  { id: 7, name: '1000 sure', email: 'front-end@team.io' },
];

/** Each must select the same rows in the database and in the browser. */
const queries = ['renee', 'wunsch strosin', 'kling hotmail', 'kling, hotmail', '100%', 'conor_', 'front-end', 'missing', '   '];

describe('searchFilter agrees with matchesTerms', () => {
  const db = getSeedDb();

  beforeAll(async () => {
    await db.execute(sql`create table if not exists search_filter_samples (id integer primary key, name text not null, email text)`);
    await db.insert(samples).values(rows).onConflictDoNothing();
  });

  afterAll(async () => {
    await db.execute(sql`drop table if exists search_filter_samples`);
  });

  it.each(queries)('%s', async (q) => {
    const found = await db
      .select({ id: samples.id })
      .from(samples)
      .where(searchFilter([samples.name, samples.email], q))
      .orderBy(samples.id);

    const terms = parseTerms(q);
    const expected = rows.filter((row) => !terms.length || matchesTerms([row.name, row.email ?? ''].map(foldText), terms)).map((row) => row.id);

    expect(found.map((row) => row.id)).toEqual(expected);
  });
});
