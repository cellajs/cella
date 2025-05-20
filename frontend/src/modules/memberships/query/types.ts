import type { ContextEntity } from 'config';
import type { UpdateMembershipProp } from '~/modules/memberships/api';
import type { Member } from '~/modules/memberships/types';
import type { ContextQueryProp, InfiniteQueryData, QueryData } from '~/query/types';

export type MemberQueryData = QueryData<Member>;
export type InfiniteMemberQueryData = InfiniteQueryData<Member>;
export type MemberContextProp = ContextQueryProp<Member, string | null>;

export type EntityMembershipContextProp = { queryContext: MemberContextProp[]; toastMessage: string };

export type MutationUpdateMembership = {
  idOrSlug: string;
  entityType: ContextEntity;
} & UpdateMembershipProp;
