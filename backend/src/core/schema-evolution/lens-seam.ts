import type { z } from '@hono/zod-openapi';
import { type LensEntityType, normalizeOps, widenedOpsKeyMap } from 'shared/schema-evolution';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/**
 * Normalize a plain entity body through its lens chain, retaining required rename twins
 * during expand.
 */
export function normalizeBody<T extends Record<string, unknown>>(entityType: LensEntityType, body: T): T {
  const { ops } = normalizeOps(entityType, body, {});
  return ops;
}

/**
 * Normalize product-create fields and timestamps through the lens chain, retaining required
 * twins during expand.
 */
export function normalizeCreateItem<T extends { stx: StxBase }>(entityType: LensEntityType, item: T): T {
  const { stx, ...fields } = item;
  const normalized = normalizeOps(entityType, fields, stx);
  return { ...normalized.ops, stx: normalized.stx } as T;
}

/**
 * Add active expand aliases to a body schema. A required canonical field becomes
 * an alias-or-canonical requirement; the schema's static type remains unchanged.
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
