import type { GetUsersResponse } from 'sdk';
import type z from 'zod';
import type { usersRouteSearchParamsSchema } from '~/modules/user/search-params-schemas';

export type BaseUser = GetUsersResponse['items'][number];

export type UsersRouteSearchParams = z.infer<typeof usersRouteSearchParamsSchema>;
