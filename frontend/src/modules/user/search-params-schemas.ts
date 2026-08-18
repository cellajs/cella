import { zGetUsersQuery } from 'sdk/zod.gen';
import z from 'zod';

export const usersSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

export const usersRouteSearchParamsSchema = zGetUsersQuery
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ userSheetId: z.string().optional() });
