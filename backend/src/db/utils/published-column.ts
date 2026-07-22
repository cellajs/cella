import { timestamp } from 'drizzle-orm/pg-core';

/**
 * Opt-in draft lifecycle column for product entity tables.
 * Null means author-only draft; a timestamp means published. Publication generation and
 * row introspection use its presence to exclude drafts from public data paths, and the column
 * must remain mutable so publishing can set it.
 */
export const publishedColumn = {
  publishedAt: timestamp('published_at', { mode: 'string' }),
};
