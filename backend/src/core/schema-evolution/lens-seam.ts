import type { z } from '@hono/zod-openapi';
import { type LensEntityType, normalizeOps, widenedOpsKeyMap } from 'shared/schema-evolution';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/**
 * Runtime lens seam for entity bodies: canonicalize old-shape field names and
 * mirror-write expand-window twins. Works for any entity body — a product
 * create item's fields or a context entity's plain create/update body (an ops
 * object and a plain body are both "partial entity bodies"; only product
 * entities additionally carry stx). Passthrough while the lens list is empty.
 */
export function normalizeBody<T extends Record<string, unknown>>(entityType: LensEntityType, body: T): T {
  const { ops } = normalizeOps(entityType, body, {});
  return ops;
}

/**
 * Create-path lens seam for sync (product) entities: canonicalize old-shape
 * field names in a create item and mirror-write expand-window twins, so both
 * DB columns stay fresh whichever bundle created the row — and rewrite the
 * item's `stx.fieldTimestamps` keys alongside. Passthrough while the lens
 * list is empty.
 */
export function normalizeCreateItem<T extends { stx: StxBase }>(entityType: LensEntityType, item: T): T {
  const { stx, ...fields } = item;
  const normalized = normalizeOps(entityType, fields, stx);
  return { ...normalized.ops, stx: normalized.stx } as T;
}

/**
 * Expand-window widening for entity body schemas (create items, plain context
 * update bodies, ops shapes): accept the old field name as an optional alias
 * of its canonical twin. When the canonical field is required, the requirement
 * relaxes to "alias or canonical present".
 *
 * The static type is intentionally unchanged — aliases exist only at runtime,
 * and `normalizeBody`/`normalizeCreateItem`/`normalizeOps` restore canonical
 * keys before any code reads the body. Identity while the lens list is empty.
 */
export function widenBodySchema<T extends z.ZodObject<z.ZodRawShape>>(entityType: LensEntityType, schema: T): T {
  const pairs = Object.entries(widenedOpsKeyMap(entityType)).filter(
    ([from, to]) => to in schema.shape && !(from in schema.shape),
  );
  if (pairs.length === 0) return schema;

  let widened: z.ZodObject<z.ZodRawShape> = schema;
  const requiredPairs: [string, string][] = [];
  for (const [from, to] of pairs) {
    const target = schema.shape[to] as z.ZodType;
    const wasRequired = !target.safeParse(undefined).success;
    widened = widened.extend({ [from]: target.optional(), ...(wasRequired ? { [to]: target.optional() } : {}) });
    if (wasRequired) requiredPairs.push([from, to]);
  }
  if (requiredPairs.length === 0) return widened as T;

  return widened.superRefine((val: Record<string, unknown>, ctx) => {
    for (const [from, to] of requiredPairs) {
      if (val[from] === undefined && val[to] === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `Either "${to}" or its legacy alias "${from}" must be provided`,
          path: [to],
        });
      }
    }
  }) as unknown as T;
}
