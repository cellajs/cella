import { sql } from 'drizzle-orm';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { matchesSearch, parseSearchQuery } from 'shared/utils/parse-search-query';
import { foldText, type MatchMode } from 'shared/utils/text-match';
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

/** Queries in the shared grammar; each must select the same rows in the database and in the browser. */
const cases: { q: string; mode?: MatchMode }[] = [
  { q: 'renee' },
  { q: 'wunsch strosin' },
  { q: '"wunsch - strosin"' },
  { q: 'kling hotmail' },
  { q: 'gmail -api' },
  { q: '-hotmail' },
  { q: '100%' },
  { q: 'conor_' },
  { q: 'front -end' },
  { q: 'tools rapid', mode: 'any' },
  { q: '"design -' },
];

/**
 * `searchFilter` is the database half of a list search and `matchesSearch` the browser half: a list filtered offline, a
 * page filtered by the server and the marks painted over the result must agree, in the template and in every app.
 */
describe('searchFilter agrees with matchesSearch', () => {
  const db = getSeedDb();

  beforeAll(async () => {
    await db.execute(sql`create table if not exists search_filter_samples (id integer primary key, name text not null, email text)`);
    await db.insert(samples).values(rows).onConflictDoNothing();
  });

  afterAll(async () => {
    await db.execute(sql`drop table if exists search_filter_samples`);
  });

  it.each(cases)('$q ($mode)', async ({ q, mode }) => {
    const found = await db
      .select({ id: samples.id })
      .from(samples)
      .where(searchFilter([samples.name, samples.email], q, mode))
      .orderBy(samples.id);

    const parsed = parseSearchQuery(q);
    const expected = rows.filter((row) => matchesSearch([row.name, row.email ?? ''].map(foldText), parsed, mode)).map((row) => row.id);

    expect(found.map((row) => row.id)).toEqual(expected);
  });
});
