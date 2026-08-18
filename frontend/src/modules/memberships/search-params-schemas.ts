import { zGetMembersQuery } from 'sdk/zod.gen';
import z from 'zod';

/** Single source for URL stripping (route search middleware) and query fallbacks; mirrors `zGetMembersQuery`. */
export const membersSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

export const membersRouteSearchParamsSchema = zGetMembersQuery
  .pick({ q: true, sort: true, order: true, role: true })
  .extend({ userSheetId: z.string().optional() });
