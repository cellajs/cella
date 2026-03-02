import { z } from '@hono/zod-openapi';
import { stxRequestSchema } from '#/schemas';

type DataType = z.ZodTypeAny;

/**
 * Create a key/data update schema for a product entity.
 * Generates a consistent update contract: `{ key, data, stx }`.
 *
 * @param keys - Array of updatable field name literals
 * @param dataType - Zod union for accepted data types (default: string | number | boolean | string[] | null)
 *
 * @example
 * ```ts
 * const attachmentUpdateStxBodySchema = createUpdateSchema(
 *   [z.literal('name'), z.literal('originalKey')],
 * );
 * ```
 */
export function createUpdateSchema<T extends [z.ZodLiteral<string>, ...z.ZodLiteral<string>[]]>(
  keys: T,
  dataType?: DataType,
) {
  const defaultDataType = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).nullable();

  return z.object({
    key: z.union(keys),
    data: dataType ?? defaultDataType,
    stx: stxRequestSchema,
  });
}
