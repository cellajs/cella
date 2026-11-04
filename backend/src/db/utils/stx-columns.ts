import { jsonb } from 'drizzle-orm/pg-core';
import type { StxStored } from '#/core/stx/build-stx';

/** Tracks mutations for CDC conflict detection. notNull: every offline or realtime mutation must carry stx metadata. */
export const stxColumns = { stx: jsonb().$type<StxStored>().notNull() };
