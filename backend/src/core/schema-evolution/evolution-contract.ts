import type { z } from '@hono/zod-openapi';
import type { ChannelEntityType, ProductEntityType } from 'shared';
import { stxBaseSchema } from '#/schemas';
import type { StxBase } from '#/schemas/sync-transaction-schemas';
import { assertBlockMediaUrls } from '#/utils/validate-block-urls';
import { resolveServerUpdateOps, resolveUpdateOps } from '../stx/resolve-update';
import { normalizeBody, normalizeCreateItem, widenBodySchema } from './lens-seam';
import { createUpdateSchema } from './update-schema';

type AnyRecord = Record<string, unknown>;

/**
 * One registration point per entity type for version-tolerant create and update body schemas.
 * @see cella/SCHEMA_EVOLUTION.md
 */
export const evolutionContract = {
  product<CS extends z.ZodRawShape, U extends z.ZodRawShape>(
    entityType: ProductEntityType,
    options: {
      createItem: z.ZodObject<CS>;
      updateOps: U;
      /** Block-document fields (BlockNote JSON) whose media references are checked on create and update. */
      blockFields?: readonly ((keyof CS & string) | (keyof U & string))[];
    },
  ) {
    const blockFields = options.blockFields ?? [];
    return {
      entityType,
      createItemSchema: widenBodySchema(entityType, options.createItem.extend({ stx: stxBaseSchema })),
      updateBodySchema: createUpdateSchema(entityType, options.updateOps),
      normalizeCreateItem: <T extends { stx: StxBase }>(item: T): T => normalizeCreateItem(entityType, item),
      resolveUpdateOps: <T extends AnyRecord>(entity: AnyRecord & { stx: StxBase }, rawOps: T, rawStx: StxBase) =>
        resolveUpdateOps(entityType, entity, rawOps, rawStx),
      resolveServerUpdateOps: <T extends AnyRecord>(entity: AnyRecord & { stx: StxBase }, rawOps: T) =>
        resolveServerUpdateOps(entityType, entity, rawOps),
      /** Refuses (400) a create item or update ops whose `blockFields` reference media outside `organizationId`. */
      assertBlockFields: (input: AnyRecord, organizationId: string): void => {
        for (const field of blockFields) {
          const value = input[field];
          if (typeof value === 'string' && value) assertBlockMediaUrls(value, organizationId, entityType, field);
        }
      },
    };
  },
  channel<CS extends z.ZodRawShape, US extends z.ZodRawShape>(
    entityType: ChannelEntityType,
    options: { createItem: z.ZodObject<CS>; updateBody: z.ZodObject<US> },
  ) {
    return {
      entityType,
      createItemSchema: widenBodySchema(entityType, options.createItem),
      updateBodySchema: widenBodySchema(entityType, options.updateBody),
      normalizeBody: <T extends AnyRecord>(body: T): T => normalizeBody(entityType, body),
    };
  },
};
