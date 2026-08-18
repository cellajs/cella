import { jsonb } from 'drizzle-orm/pg-core';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/** Tracks mutations for CDC conflict detection. notNull: every offline or realtime mutation must carry stx metadata. */
export const stxColumns = {
  stx: jsonb().$type<StxBase>().notNull(),
};
