import type { ContextEntityType } from 'config';
import type { UpdateMembershipProp } from '~/modules/memberships/api';
import type { Member } from '~/modules/memberships/types';
import type { Organization } from '~/modules/organizations/types';
import type { ContextProp, ContextQueryProp, InfiniteQueryData, QueryData } from '~/query/types';

export type MemberQueryData = QueryData<Member>;
export type InfiniteMemberQueryData = InfiniteQueryData<Member>;
export type MemberContextProp = ContextQueryProp<Member, string | null> | ContextProp<Organization, string | null>;

export type EntityMembershipContextProp = { queryContext: MemberContextProp[]; toastMessage: string };

export type MutationUpdateMembership = {
  idOrSlug: string;
  entityType: ContextEntityType;
} & UpdateMembershipProp;
