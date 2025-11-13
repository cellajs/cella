import { SystemRoles } from 'config';
import type z from 'zod';
import type { MembershipBase, User } from '~/api.gen';
import type { usersRouteSearchParamsSchema } from '~/routes/search-params-schemas';

export type UserWithRoleAndMemberships = User & { memberships: MembershipBase[]; role?: SystemRoles };

export type UsersRouteSearchParams = z.infer<typeof usersRouteSearchParamsSchema>;
