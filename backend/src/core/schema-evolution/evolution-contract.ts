import type { z } from '@hono/zod-openapi';
import type { ChannelEntityType, ProductEntityType } from 'shared';
import { stxBaseSchema } from '#/schemas';
import type { StxBase } from '#/schemas/sync-transaction-schemas';
import { resolveServerUpdateOps, resolveUpdateOps } from '../stx/resolve-update';
import { normalizeBody, normalizeCreateItem, widenBodySchema } from './lens-seam';
import { createUpdateSchema } from './update-schema';

type AnyRecord = Record<string, unknown>;

/**
 * Schema-evolution contract — the single registration point per entity type
 * for version-tolerant wire schemas (an entity's create/update body schemas as
 * they cross the API boundary) plus the bound runtime seams that keep them
 * honest across schema versions.
 *
 * @see cella/SCHEMA_EVOLUTION.md
 */
export const evolutionContract = {
  product<CS extends z.ZodRawShape, U extends z.ZodRawShape>(
    entityType: ProductEntityType,
    options: { createItem: z.ZodObject<CS>; updateOps: U },
  ) {
    return {
      entityType,
      createItemSchema: widenBodySchema(entityType, options.createItem.extend({ stx: stxBaseSchema })),
      updateBodySchema: createUpdateSchema(entityType, options.updateOps),
      normalizeCreateItem: <T extends { stx: StxBase }>(item: T): T => normalizeCreateItem(entityType, item),
      resolveUpdateOps: <T extends AnyRecord>(entity: AnyRecord & { stx: StxBase }, rawOps: T, rawStx: StxBase) =>
        resolveUpdateOps(entityType, entity, rawOps, rawStx),
      resolveServerUpdateOps: <T extends AnyRecord>(entity: AnyRecord & { stx: StxBase }, rawOps: T) =>
        resolveServerUpdateOps(entityType, entity, rawOps),
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
