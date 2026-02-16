import z from 'zod';

/**
 * Search params schema for operations route.
 * operationTag uses string instead of enum since tag names are fetched at runtime.
 */
export const operationsRouteSearchParamsSchema = z.object({
  operationTag: z.string().optional(),
  q: z.string().optional(),
});

/**
 * Search params schema for schemas route.
 */
export const schemasRouteSearchParamsSchema = z.object({
  schemaTag: z.enum(['base', 'data', 'errors']).optional(),
});
