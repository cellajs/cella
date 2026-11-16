import type { z } from '@hono/zod-openapi';
import type { ChannelEntityType, ProductEntityType } from 'shared';
import { normalizeBody, normalizeCreateItem, widenBodySchema } from '#/core/schema-evolution/lens-seam';
import { createUpdateItemSchema, createUpdateSchema } from '#/core/schema-evolution/update-schema';
import { resolveServerUpdateOps, resolveUpdateOps } from '#/core/stx/resolve-update';
import { type StxBase, stxBaseSchema } from '#/schemas/sync-transaction-schemas';
import { assertBlockMediaUrls } from '#/utils/validate-block-media';

type AnyRecord = Record<string, unknown>;

/** A copy of `shape` without `keys`. */
const omitKeys = <S extends object, K extends PropertyKey>(shape: S, keys: readonly K[]): Omit<S, K> => {
  const kept = { ...shape };
  for (const key of keys) Reflect.deleteProperty(kept, key);
  return kept;
};

/** One registration point per entity type for version-tolerant create and update body schemas. */
export const evolutionContract = {
  product<CS extends z.ZodRawShape, U extends z.ZodRawShape, B extends (keyof CS & string) | (keyof U & string) = never>(
    entityType: ProductEntityType,
    options: {
      createItem: z.ZodObject<CS>;
      updateOps: U;
      /** Block-document fields (BlockNote JSON) whose media references are checked on create and update. */
      blockFields?: readonly B[];
    },
  ) {
    const blockFields = options.blockFields ?? [];
    return {
      entityType,
      /** One create item with its `stx`; the module bounds the request array with `.array().min().max()`. */
      createItemSchema: widenBodySchema(entityType, options.createItem.extend({ stx: stxBaseSchema })),
      updateBodySchema: createUpdateSchema(entityType, options.updateOps),
      /** One row of a batch update, which takes no block field: one block document may fill a whole request body. */
      updateItemSchema: createUpdateItemSchema(entityType, omitKeys(options.updateOps, blockFields)),
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
