import type { z } from '@hono/zod-openapi';
import type { ContextEntityType, ProductEntityType } from 'shared';
import { stxBaseSchema } from '#/schemas';
import type { StxBase } from '#/schemas/sync-transaction-schemas';
import { normalizeBody, normalizeCreateItem, widenBodySchema } from './stx/lens-seam';
import { resolveUpdateOps } from './stx/resolve-update';
import { createUpdateSchema } from './stx/update-schema';

/**
 * Entity wire seam — the single registration point per entity module for
 * version-tolerant wire schemas (schema evolution lenses).
 *
 * Both entity classes share the same widening/normalization layer; only the
 * write semantics differ:
 * - `createProductEntityWire` — stx-based sync writes: create items carry
 *   `stx`, updates are `{ ops, stx }` merged per-field (HLC/AWSet);
 * - `createContextEntityWire` — plain full-body writes: create items and
 *   partial update bodies, no stx.
 *
 * The factories widen every derived schema for active expand windows and
 * expose entity-bound runtime normalizers, so the entityType is declared
 * exactly once per module and operations cannot pass a mismatched one.
 * Everything is a passthrough while the lens list is empty. The `lens:check`
 * wire-completeness rule asserts every configured entity type registers here.
 * See cella/SCHEMA_EVOLUTION.md (Design revision).
 */

type AnyRecord = Record<string, unknown>;

/**
 * Wire schemas + bound runtime seams for a product (sync) entity.
 *
 * @param entityType - Product entity, declared once for all derived pieces
 * @param options.createItem - Module-assembled create item body (without stx);
 *   keeps drizzle-zod/refined validators and defaults. Widened during expand.
 * @param options.updatable - Ops shape for `{ ops, stx }` updates: scalar LWW
 *   fields plus AWSet delta fields (`arrayDeltaSchema`).
 */
export function createProductEntityWire<CS extends z.ZodRawShape, U extends z.ZodRawShape>(
  entityType: ProductEntityType,
  options: { createItem: z.ZodObject<CS>; updatable: U },
) {
  return {
    entityType,
    /** Create item body incl. `stx`, lens-widened. Compose batches with `.array().min().max()`. */
    createItemSchema: widenBodySchema(entityType, options.createItem.extend({ stx: stxBaseSchema })),
    /** `{ ops, stx }` update body, ops lens-widened, ≥1 op required. */
    updateBodySchema: createUpdateSchema(entityType, options.updatable),
    /** Runtime seam: canonicalize a validated create item (fields + stx.fieldTimestamps) before any body access. */
    normalizeCreateItem: <T extends { stx: StxBase }>(item: T): T => normalizeCreateItem(entityType, item),
    /** Runtime seam: normalize + no-op-filter + HLC/AWSet-resolve a validated update. */
    resolveUpdateOps: <T extends AnyRecord>(
      entity: AnyRecord & { stx: StxBase },
      rawOps: T,
      rawStx: Pick<StxBase, 'mutationId' | 'sourceId' | 'fieldTimestamps'>,
    ) => resolveUpdateOps(entityType, entity, rawOps, rawStx),
  };
}

/**
 * Wire schemas + bound runtime seam for a context (plain REST) entity.
 *
 * Context writes have no ops/stx and no per-field merge, so the lens artifact
 * set reduces to body widening + key normalization (plus the shared client
 * cache migration).
 *
 * @param entityType - Context entity, declared once for all derived pieces
 * @param options.createItem - Module-assembled create item body. Widened during expand.
 * @param options.updateBody - Module-assembled partial update body. Widened during expand.
 */
export function createContextEntityWire<CS extends z.ZodRawShape, US extends z.ZodRawShape>(
  entityType: ContextEntityType,
  options: { createItem: z.ZodObject<CS>; updateBody: z.ZodObject<US> },
) {
  return {
    entityType,
    /** Create item body, lens-widened. Compose batches with `.array().min().max().refine(...)`. */
    createItemSchema: widenBodySchema(entityType, options.createItem),
    /** Partial update body, lens-widened. */
    updateBodySchema: widenBodySchema(entityType, options.updateBody),
    /** Runtime seam: canonicalize a validated create/update body before any body access. */
    normalizeBody: <T extends AnyRecord>(body: T): T => normalizeBody(entityType, body),
  };
}
