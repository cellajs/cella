import { SystemRole } from 'shared';
import type z from 'zod';
import type { User } from '~/api.gen';
import type { usersRouteSearchParamsSchema } from '~/modules/user/search-params-schemas';

export type UserWithRole = User & { role?: SystemRole };

export type UsersRouteSearchParams = z.infer<typeof usersRouteSearchParamsSchema>;
