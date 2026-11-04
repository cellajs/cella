import { zGetUsersQuery } from 'sdk/zod.gen';
import { z } from 'zod';
import { listSearchDefaults, listSearchSchema } from '~/modules/common/search-params-schemas';

export const usersSearchDefaults = listSearchDefaults(zGetUsersQuery);

export const usersRouteSearchParamsSchema = listSearchSchema(zGetUsersQuery).extend({
  role: zGetUsersQuery.shape.role.catch(undefined),
  userSheetId: z.string().optional(),
});
