import { timestamp } from 'drizzle-orm/pg-core';

/**
 * Opt-in draft lifecycle column for product entity tables.
 *
 * NULL = author-only draft; set = published. Deliberately nullable with NO default because
 * the null state is meaningful, unlike the channel-entity `publishedAt`
 * (`channel-entity-columns.ts`), which defaults to now and gates invitees, not readers.
 *
 * Spread into a product table (`...publishedColumn`) to opt that entity into drafts:
 * the CDC publication gains a row filter for the table on regeneration (`pnpm generate`
 * + `pnpm migrate`, see `publication-filter.ts`) so drafts never enter the replication
 * stream, and API reads, counters, stamps and unseen badges all key on the column via
 * introspection (see `shared/src/published-rows.ts`) — no further wiring is needed.
 * The template ships this helper unused. Do NOT add `published_at` to the immutability
 * trigger lists because publishing mutates it by design.
 */
export const publishedColumn = {
  publishedAt: timestamp('published_at', { mode: 'string' }),
};
