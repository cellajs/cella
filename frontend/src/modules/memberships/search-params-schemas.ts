import { zGetMembersQuery } from 'sdk/zod.gen';
import { z } from 'zod';

/** Single source for URL stripping (route search middleware) and query fallbacks; mirrors `zGetMembersQuery`'s defaults. */
export const membersSearchDefaults = { q: '', sort: 'lastSeenAt', order: 'desc' } as const;

export const membersRouteSearchParamsSchema = zGetMembersQuery.pick({ q: true }).extend({
  sort: zGetMembersQuery.shape.sort.catch(membersSearchDefaults.sort),
  order: zGetMembersQuery.shape.order.catch(membersSearchDefaults.order),
  role: zGetMembersQuery.shape.role.catch(undefined),
  userSheetId: z.string().optional(),
});
