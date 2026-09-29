import type { SQL } from 'drizzle-orm';
import { PgDialect, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { PUBLISHED_ROW_FILTER, publicationRowFilter } from './publication-filter';
import { draftVisibleRowsPredicate, publishedRowsPredicate } from './published-predicate';

const draftProduct = pgTable('test_pub_items', {
  id: varchar('id').primaryKey(),
  publishedAt: timestamp('published_at', { mode: 'string' }),
});

const plainProduct = pgTable('test_pub_attachments', {
  id: varchar('id').primaryKey(),
});

const authoredDraftProduct = pgTable('test_pub_notes', {
  id: varchar('id').primaryKey(),
  publishedAt: timestamp('published_at', { mode: 'string' }),
  createdBy: varchar('created_by'),
});

const normalize = (s: string) => s.replaceAll('"', '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const compile = (predicate: SQL | undefined) => new PgDialect().sqlToQuery(predicate as SQL);

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
    // The replication boundary and the read boundary must not drift: compare the compiled predicate with the constant.
    const predicate = publishedRowsPredicate(draftProduct);
    expect(predicate).toBeDefined();
    expect(normalize(compile(predicate).sql)).toBe(normalize(`test_pub_items.${PUBLISHED_ROW_FILTER}`));
  });
});

// The SQL twin of shared `draftVisibleTo`: a draft is its author's alone, system admins included.
describe('draftVisibleRowsPredicate', () => {
  it("matches published rows and the actor's own drafts", () => {
    const { sql, params } = compile(draftVisibleRowsPredicate(authoredDraftProduct, 'author-1'));
    expect(normalize(sql)).toBe('test_pub_notes.published_at is not null or test_pub_notes.created_by = $1');
    expect(params).toEqual(['author-1']);
  });

  it('shows drafts to nobody on a table without an author column, and filters nothing without drafts', () => {
    expect(normalize(compile(draftVisibleRowsPredicate(draftProduct, 'author-1')).sql)).toBe(
      'test_pub_items.published_at is not null',
    );
    expect(draftVisibleRowsPredicate(plainProduct, 'author-1')).toBeUndefined();
  });
});
