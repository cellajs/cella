import { z } from 'zod';

/** The search both operations views share; the view toggle carries it across. */
export const operationSearchSchema = z.object({ q: z.string().optional(), filter: z.string().optional() });

/** operationTag is a string because tag names are fetched at runtime. */
export const operationsRouteSearchParamsSchema = operationSearchSchema.extend({ operationTag: z.string().optional() });

export const operationsTableRouteSearchParamsSchema = operationSearchSchema.extend({
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

/** schemaTag is a string because schema tag names are backend-configured (tags with `kind: 'schema'`). */
export const schemasRouteSearchParamsSchema = z.object({ schemaTag: z.string().optional() });
