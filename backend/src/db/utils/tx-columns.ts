import { jsonb } from 'drizzle-orm/pg-core';
import type { TxBase } from '#/schemas/tx-base-schema';

/**
 * Transaction column for sync-enabled entities (offline/realtime).
 * Used to track mutations and enable conflict detection via CDC Worker.
 * Required (notNull) because all offline/realtime entity mutations MUST include tx metadata.
 */
export const txColumns = {
  tx: jsonb().$type<TxBase>().notNull(),
};
