import z from 'zod';

export const pagesRouteSearchParamsSchema = z.object({
  q: z.string().optional(),
});
