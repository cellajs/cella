import { zGetPagesQuery } from 'sdk/zod.gen';

/**
 * Search params schema for pages route.
 */
export const pagesRouteSearchParamsSchema = zGetPagesQuery.pick({ q: true });
