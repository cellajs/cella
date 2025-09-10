import type z from 'zod';
import type { MembershipBaseSchema, User } from '~/api.gen';
import type { usersRouteSearchParamsSchema } from '~/routes/search-params-schemas';

export type UserWithMemberships = User & { memberships: MembershipBaseSchema[] };

export type UsersRouteSearchParams = z.infer<typeof usersRouteSearchParamsSchema>;
