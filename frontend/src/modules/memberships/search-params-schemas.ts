import z from 'zod';
import { zGetMembersData } from '~/api.gen/zod.gen';

/**
 * Search params schema for members route.
 */
export const membersRouteSearchParamsSchema = zGetMembersData.shape.query
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ userSheetId: z.string().optional() });
