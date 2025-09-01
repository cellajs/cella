import type { ContextEntityType } from 'config';
import type {
  DeleteMembershipsData,
  GetMembersResponse,
  GetPendingInvitationsResponse,
  MembershipInviteData,
  UpdateMembershipData,
  UpdateMembershipResponse,
} from '~/api.gen';
import type { EntityPage } from '~/modules/entities/types';
import type { ContextQueryProp, InfiniteQueryData, QueryData } from '~/query/types';

export type Member = GetMembersResponse['items'][number];
export type Membership = UpdateMembershipResponse;
export type PendingInvitation = GetPendingInvitationsResponse['items'][number];

export type MemberQueryData = QueryData<Member>;
export type InfiniteMemberQueryData = InfiniteQueryData<Member>;
export type MemberContextProp = ContextQueryProp<Member, string | null>;

export type EntityMembershipContextProp = { queryContext: MemberContextProp[]; toastMessage: string };

export type InviteMember = NonNullable<MembershipInviteData['body']> & { entity: EntityPage };

type UpdateMembershipProp = NonNullable<UpdateMembershipData['body']> & UpdateMembershipData['path'];
export type MutationUpdateMembership = {
  idOrSlug: string;
  entityType: ContextEntityType;
} & UpdateMembershipProp;

export type DeleteMembership = DeleteMembershipsData['query'] & DeleteMembershipsData['path'] & { members: Member[] };
