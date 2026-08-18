import { timestamp } from 'drizzle-orm/pg-core';

/** Opt-in draft lifecycle: null is an author-only draft, a timestamp is published. Stays mutable. */
export const publishedColumn = {
  publishedAt: timestamp('published_at', { mode: 'string' }),
};
