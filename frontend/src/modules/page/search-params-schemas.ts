import { zGetPagesData } from '~/api.gen/zod.gen';

/**
 * Search params schema for pages route.
 */
export const pagesRouteSearchParamsSchema = zGetPagesData.shape.query
  .unwrap()
  .pick({ q: true, sort: true, order: true });
