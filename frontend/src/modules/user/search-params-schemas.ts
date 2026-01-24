import z from 'zod';
import { zGetUsersData } from '~/api.gen/zod.gen';

/**
 * Search params schema for users route.
 */
export const usersRouteSearchParamsSchema = zGetUsersData.shape.query
  .unwrap()
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ userSheetId: z.string().optional() });
