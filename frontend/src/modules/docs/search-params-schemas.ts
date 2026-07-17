import z from 'zod';

/**
 * Search params schema for operations route.
 * operationTag is a string because tag names are fetched at runtime.
 */
export const operationsRouteSearchParamsSchema = z.object({
  operationTag: z.string().optional(),
  q: z.string().optional(),
});

/**
 * Schemas-route search params. schemaTag is a string, not an enum, because bucket names are
 * backend-configured (tags with `kind: 'schema'`) and resolved at runtime.
 */
export const schemasRouteSearchParamsSchema = z.object({
  schemaTag: z.string().optional(),
});
