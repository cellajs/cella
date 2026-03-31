import { zGetMembersData } from 'sdk/zod.gen';
import z from 'zod';

/**
 * Search params schema for members route.
 */
export const membersRouteSearchParamsSchema = zGetMembersData.shape.query
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ userSheetId: z.string().optional() });
