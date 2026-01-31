import { z } from '@hono/zod-openapi';
import { jsonb } from 'drizzle-orm/pg-core';
import { nanoid } from '#/utils/nanoid';

/**
 * Zod schema for TxBase.
 */
export const txBaseSchema = z
  .object({
    id: z.string(),
    sourceId: z.string(),
    version: z.number(),
    fieldVersions: z.record(z.string(), z.number()),
  })
  .openapi('TxBase', {
    example: {
      id: 'gen-abc123def456ghi789',
      sourceId: 'src_gen-xyz987wvu654',
      version: 1,
      fieldVersions: { name: 1, description: 1 },
    },
  });

export type TxBase = z.infer<typeof txBaseSchema>;

/**
 * Create transaction metadata for server-side entity creation.
 * Use this for system-generated entities (seeds, imports, background jobs)
 * that bypass the normal client mutation flow.
 */
export function createServerTx(): TxBase {
  return {
    id: nanoid(),
    sourceId: 'server',
    version: 1,
    fieldVersions: {},
  };
}

/**
 * Transaction column for sync-enabled entities (offline/realtime).
 * Used to track mutations and enable conflict detection via CDC Worker.
 * Required (notNull) because all offline/realtime entity mutations MUST include tx metadata.
 */
export const txColumns = {
  tx: jsonb().$type<TxBase>().notNull(),
};
