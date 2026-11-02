import { zGetUsersQuery } from 'sdk/zod.gen';
import { z } from 'zod';

export const usersSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

export const usersRouteSearchParamsSchema = zGetUsersQuery.pick({ q: true }).extend({
  sort: zGetUsersQuery.shape.sort.catch(usersSearchDefaults.sort),
  order: zGetUsersQuery.shape.order.catch(usersSearchDefaults.order),
  role: zGetUsersQuery.shape.role.catch(undefined),
  userSheetId: z.string().optional(),
});
