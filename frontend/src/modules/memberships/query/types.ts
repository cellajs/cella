import type { Member } from '~/modules/memberships/types';
import type { ContextProp, InfiniteQueryData, QueryData } from '~/query/types';

export type MemberQueryData = QueryData<Member>;
export type InfiniteMemberQueryData = InfiniteQueryData<Member>;
export type MemberContextProp = ContextProp<Member, string | null>;

export type EntityMembershipContextProp = { queryContext: MemberContextProp[]; toastMessage: string };
