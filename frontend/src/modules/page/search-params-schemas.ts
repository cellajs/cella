import { zGetPagesData } from 'sdk/zod.gen';

/**
 * Search params schema for pages route.
 */
export const pagesRouteSearchParamsSchema = zGetPagesData.shape.query.unwrap().pick({ q: true });
