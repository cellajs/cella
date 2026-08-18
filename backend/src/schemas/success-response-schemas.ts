import { z } from '@hono/zod-openapi';

export const paginationSchema = <O, I>(schema: z.ZodType<O, I>) =>
  z.object({
    items: z.array(schema),
    total: z.number(),
  });

/** Passing an item schema produces `data: T[]`; omitting it requires an empty data array. */
export const batchResponseSchema = <T extends z.ZodTypeAny>(itemSchema?: T) =>
  z.object({
    data: itemSchema ? z.array(itemSchema) : z.tuple([]).rest(z.never()),
    rejectedIds: z.array(z.string()).describe('Identifiers of items that could not be processed'),
    rejectionReasons: z
      .record(z.string(), z.array(z.string()))
      .optional()
      .describe('Map of reason code to rejected item IDs'),
  });

export interface BatchResponseEmpty {
  data: [];
  rejectedIds: string[];
  rejectionReasons?: Record<string, string[]>;
}
