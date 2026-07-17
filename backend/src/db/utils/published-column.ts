import { timestamp } from 'drizzle-orm/pg-core';

/**
 * Opt-in draft lifecycle column for product entity tables.
 *
 * NULL = author-only draft; set = published. Deliberately nullable with NO default —
 * the null state is the meaningful one — unlike the channel-entity `publishedAt`
 * (`channel-entity-columns.ts`), which defaults to now and gates invitees, not readers.
 *
 * Spread into a product table (`...publishedColumn`) to opt that entity into drafts:
 * dispatch, collection/delta reads, counters, stamps and unseen badges all key on it
 * via column introspection (see `shared/src/published-rows.ts`), so no further wiring
 * is needed. The template ships this helper unused. Do NOT add `published_at` to the
 * immutability trigger lists — publishing mutates it by design.
 */
export const publishedColumn = {
  publishedAt: timestamp('published_at', { mode: 'string' }),
};
