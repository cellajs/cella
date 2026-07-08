import type { z } from '@hono/zod-openapi';
import type { ContextEntityType, ProductEntityType } from 'shared';
import { stxBaseSchema } from '#/schemas';
import type { StxBase } from '#/schemas/sync-transaction-schemas';
import { resolveUpdateOps } from '../stx/resolve-update';
import { normalizeBody, normalizeCreateItem, widenBodySchema } from './lens-seam';
import { createUpdateSchema } from './update-schema';

/**
 * Schema-evolution contract — the single registration point per entity module
 * for version-tolerant wire schemas (an entity's create/update body schemas as
 * they cross the API boundary) plus the bound runtime seams that keep them
 * honest across schema versions.
 *
 * Vocabulary: a *lens* is an append-only delta transform (`shared/schema-evolution`);
 * a *contract* is what an entity registers here so those lenses attach to its
 * create/update body schemas. Everything is a passthrough while the lens list
 * is empty — the contract is also just the entity's body-schema registration
 * when no lens exists.
 *
 * Two factories under one object — `evolutionContract.product` / `.context` —
 * rather than one factory with a class flag: each is its own generic function,
 * so the create-item and ops shapes infer precisely (a class discriminant would
 * collapse inference to `Record<string, unknown>`, the exact failure a
 * mispositioned argument once caused). Both share the same widening/normalization
 * layer; only the write semantics differ:
 * - `.product` — stx-based sync writes: create items carry `stx`, updates are
 *   `{ ops, stx }` merged per-field (HLC/AWSet);
 * - `.context` — plain full-body writes: create items and partial update
 *   bodies, no stx.
 *
 * The factories widen every derived schema for active expand windows and expose
 * entity-bound runtime normalizers, so the entityType is declared exactly once
 * per module and operations cannot pass a mismatched one. The `lens:check`
 * contract-completeness rule asserts every configured entity type registers
 * here. See cella/SCHEMA_EVOLUTION.md (Design revision).
 */

type AnyRecord = Record<string, unknown>;

export const evolutionContract = {
  /**
   * Wire schemas + bound runtime seams for a product (sync) entity.
   *
   * @param entityType - Product entity, declared once for all derived pieces
   * @param options.createItem - Module-assembled create item body (without stx);
   *   keeps drizzle-zod/refined validators and defaults. Widened during expand.
   *   A single item — modules `.array()` it (with entity-specific min/max/refine)
   *   to form the batch create body.
   * @param options.updateOps - Ops shape for `{ ops, stx }` updates: scalar LWW
   *   fields plus AWSet delta fields (`arrayDeltaSchema`).
   */
  product<CS extends z.ZodRawShape, U extends z.ZodRawShape>(
    entityType: ProductEntityType,
    options: { createItem: z.ZodObject<CS>; updateOps: U },
  ) {
    return {
      entityType,
      // Single create item (createItem + stx), lens-widened. Modules `.array()`
      // it (with entity-specific min/max/refine) to form the batch create body.
      createItemSchema: widenBodySchema(entityType, options.createItem.extend({ stx: stxBaseSchema })),
      updateBodySchema: createUpdateSchema(entityType, options.updateOps),
      normalizeCreateItem: <T extends { stx: StxBase }>(item: T): T => normalizeCreateItem(entityType, item),
      resolveUpdateOps: <T extends AnyRecord>(
        entity: AnyRecord & { stx: StxBase },
        rawOps: T,
        rawStx: Pick<StxBase, 'mutationId' | 'sourceId' | 'fieldTimestamps'>,
      ) => resolveUpdateOps(entityType, entity, rawOps, rawStx),
    };
  },

  /**
   * Wire schemas + bound runtime seam for a context (plain REST) entity.
   *
   * Context writes have no ops/stx and no per-field merge, so the lens artifact
   * set reduces to body widening + key normalization (plus the shared client
   * cache migration).
   *
   * @param entityType - Context entity, declared once for all derived pieces
   * @param options.createItem - Module-assembled create item body. A single item —
   *   modules `.array()` it to form the batch create body. Widened during expand.
   * @param options.updateBody - Module-assembled partial update body. Widened during expand.
   */
  context<CS extends z.ZodRawShape, US extends z.ZodRawShape>(
    entityType: ContextEntityType,
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
