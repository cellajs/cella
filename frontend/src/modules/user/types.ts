import type z from 'zod';
import type { GetUsersResponse } from '~/api.gen';
import type { usersRouteSearchParamsSchema } from '~/modules/user/search-params-schemas';

export type BaseUser = GetUsersResponse['items'][number];

export type UsersRouteSearchParams = z.infer<typeof usersRouteSearchParamsSchema>;
