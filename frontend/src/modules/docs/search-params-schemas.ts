import z from 'zod';

/** operationTag is a string because tag names are fetched at runtime. */
export const operationsRouteSearchParamsSchema = z.object({
  operationTag: z.string().optional(),
  q: z.string().optional(),
});

/** schemaTag is a string because bucket names are backend-configured (tags with `kind: 'schema'`). */
export const schemasRouteSearchParamsSchema = z.object({
  schemaTag: z.string().optional(),
});
