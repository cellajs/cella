import type { MembershipBaseSchema, User } from '~/api.gen';

export type UserWithMemberships = User & { memberships: MembershipBaseSchema[] };
