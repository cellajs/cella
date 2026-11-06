import { z } from '@hono/zod-openapi';
import type { ProductEntityType } from 'shared';
import { tombstoneKeys } from '#/utils/seq-range';

/** The `totalSize` of a list page; a list whose count is no exact count describes its own. */
const totalSizeSchema = z.int().min(0).describe('Results across all pages, after filters: an exact count.');

/**
 * A page of a list (AEP-132, AEP-158): its `results`, a `nextPageToken` while more results follow, and the `totalSize`
 * across all pages.
 */
export const paginationSchema = <O, I>(schema: z.ZodType<O, I>, totalSize = totalSizeSchema) =>
  z.object({
    results: z.array(schema),
    nextPageToken: z.string().optional().describe('Pass as `pageToken` to read the next page. Absent on the last page.'),
    totalSize,
  });

/** A page of a product list, whose range reads return soft-deleted rows as tombstones (`projectTombstones`). */
export const productListResponseSchema = <T extends z.ZodObject>(entityType: ProductEntityType, schema: T) => {
  const kept = new Set(tombstoneKeys(entityType));
  const tombstone = z
    .object({ ...Object.fromEntries(Object.entries(schema.shape).filter(([key]) => kept.has(key))), deletedAt: z.string() })
    .describe('A soft-deleted row: the fields that place it, without its content.');
  const totalSize = totalSizeSchema.describe(
    "Results across all pages, after filters. Exact, except an organization-wide read without a search, which counts from the organization's counter and can trail a write by moments. A range read counts its own results.",
  );
  return paginationSchema(z.union([schema, tombstone]), totalSize);
};

/** Passing an item schema produces `data: T[]`; omitting it requires an empty data array. */
export const batchResponseSchema = <T extends z.ZodTypeAny>(itemSchema?: T) =>
  z.object({
    data: itemSchema ? z.array(itemSchema) : z.array(z.unknown()).max(0),
    rejectedIds: z.array(z.string()).describe('Identifiers of items that could not be processed'),
    rejectionReasons: z.record(z.string(), z.array(z.string())).optional().describe('Map of reason code to rejected item IDs'),
  });

/** The result of a batch operation that returns no rows: the rejected ids, optionally by reason. */
export type BatchResponseEmpty = z.infer<ReturnType<typeof batchResponseSchema<z.ZodNever>>>;
