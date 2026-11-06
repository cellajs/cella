import { zListMembersQuery } from 'sdk/zod.gen';
import { z } from 'zod';
import { listSearchDefaults, listSearchSchema } from '~/modules/common/search-params-schemas';

/** Single source for URL stripping (route search middleware), the table's local search and query fallbacks. */
export const membersSearchDefaults = listSearchDefaults(zListMembersQuery);

export const membersRouteSearchParamsSchema = listSearchSchema(zListMembersQuery).extend({
  role: zListMembersQuery.shape.role.catch(undefined),
  userSheetId: z.string().optional(),
});
