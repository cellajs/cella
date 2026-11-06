import { zListUsersQuery } from 'sdk/zod.gen';
import { z } from 'zod';
import { listSearchDefaults, listSearchSchema } from '~/modules/common/search-params-schemas';

export const usersSearchDefaults = listSearchDefaults(zListUsersQuery);

export const usersRouteSearchParamsSchema = listSearchSchema(zListUsersQuery).extend({
  role: zListUsersQuery.shape.role.catch(undefined),
  userSheetId: z.string().optional(),
});
