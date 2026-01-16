import { SystemRole } from 'config';
import type z from 'zod';
import type { MembershipBase, User } from '~/api.gen';
import type { usersRouteSearchParamsSchema } from '~/routes/search-params-schemas';

export type UserWithRoleAndMemberships = User & { memberships: MembershipBase[]; role?: SystemRole };

export type UsersRouteSearchParams = z.infer<typeof usersRouteSearchParamsSchema>;
