import { jsonb } from 'drizzle-orm/pg-core';
import type { StxBase } from '#/schemas/stx-base-schema';

/**
 * Sync transaction column for sync-enabled entities (offline/realtime).
 * Used to track mutations and enable conflict detection via CDC Worker.
 * Required (notNull) because all offline/realtime entity mutations MUST include stx metadata.
 */
export const stxColumns = {
  stx: jsonb().$type<StxBase>().notNull(),
};
