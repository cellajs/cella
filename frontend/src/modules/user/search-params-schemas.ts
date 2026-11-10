import { zListUsersQuery } from 'sdk/zod.gen';
import { z } from 'zod';
import { csvSearchParam, listSearchDefaults, listSearchSchema, userSheetSearchSchema } from '~/modules/common/search-params-schemas';

export const usersSearchDefaults = listSearchDefaults(zListUsersQuery);

/** The account sets the system table lists beside the proven ones: `anonymous`, accounts without a proven address, such as a demo's. */
export const accountSetValues = ['anonymous'] as const;

export const usersRouteSearchParamsSchema = listSearchSchema(zListUsersQuery).extend({
  role: zListUsersQuery.shape.role.catch(undefined),
  accounts: csvSearchParam(z.enum(accountSetValues)),
  ...userSheetSearchSchema.shape,
});
