import type { sql } from 'drizzle-orm';
import { PgDialect, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { PUBLISHED_ROW_FILTER, publicationRowFilter } from './publication-filter';
import { publishedRowsPredicate } from './published-predicate';

const draftProduct = pgTable('test_pub_items', {
  id: varchar('id').primaryKey(),
  publishedAt: timestamp('published_at', { mode: 'string' }),
});

const plainProduct = pgTable('test_pub_attachments', {
  id: varchar('id').primaryKey(),
});

// Channel-entity shape: has publishedAt (defaultNow invitee gate) but is NOT a product.
const channel = pgTable('test_pub_courses', {
  id: varchar('id').primaryKey(),
  publishedAt: timestamp('published_at', { mode: 'string' }).defaultNow(),
});

describe('publicationRowFilter', () => {
  const productTypes = ['item', 'attachment'] as const;

  it('filters draft-lifecycle product tables only', () => {
    expect(publicationRowFilter('item', draftProduct, productTypes)).toBe(PUBLISHED_ROW_FILTER);
    expect(publicationRowFilter('attachment', plainProduct, productTypes)).toBeUndefined();
  });

  it('never filters channel tables, even with a publishedAt column', () => {
    expect(publicationRowFilter('course', channel, productTypes)).toBeUndefined();
  });

  it('the publication filter and the API read predicate express the SAME condition', () => {
    // The replication boundary and the read boundary must never drift apart: compile the
    // drizzle predicate and compare it (normalized) with the publication WHERE constant.
    const predicate = publishedRowsPredicate(draftProduct);
    expect(predicate).toBeDefined();
    const compiled = new PgDialect().sqlToQuery(predicate as ReturnType<typeof sql.raw>).sql;
    const normalize = (s: string) =>
      s.replaceAll('"', '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    expect(normalize(compiled)).toBe(normalize(`test_pub_items.${PUBLISHED_ROW_FILTER}`));
  });
});
