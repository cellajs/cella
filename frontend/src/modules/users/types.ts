import type z from 'zod';
import type { MembershipBase, User } from '~/api.gen';
import type { usersRouteSearchParamsSchema } from '~/routes/search-params-schemas';

export type UserWithMemberships = User & { memberships: MembershipBase[] };

export type UsersRouteSearchParams = z.infer<typeof usersRouteSearchParamsSchema>;
