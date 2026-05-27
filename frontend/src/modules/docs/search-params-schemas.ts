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
 * schemaTag uses string instead of enum since bucket names are configured by the
 * backend (registered tags with `kind: 'schema'`) and resolved at runtime.
 */
export const schemasRouteSearchParamsSchema = z.object({
  schemaTag: z.string().optional(),
});
