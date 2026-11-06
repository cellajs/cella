import type { ListUsersResponse } from 'sdk';
import type { z } from 'zod';
import type { usersRouteSearchParamsSchema } from '~/modules/user/search-params-schemas';

export type BaseUser = ListUsersResponse['items'][number];

export type UsersRouteSearchParams = z.infer<typeof usersRouteSearchParamsSchema>;
