import z from 'zod';

/**
 * Search params schema for pages route.
 */
export const pagesRouteSearchParamsSchema = z.object({
  q: z.string().optional(),
});
