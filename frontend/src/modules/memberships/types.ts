import type {
  DeleteMembershipsData,
  GetMembersResponse,
  GetPendingMembershipsResponse,
  MembershipInviteData,
  UpdateMembershipData,
} from 'sdk';
import type { ChannelEntityType } from 'shared';
import type z from 'zod';
import type { EnrichedChannelEntity } from '~/modules/entities/types';
import type { membersRouteSearchParamsSchema } from '~/modules/memberships/search-params-schemas';
import type { ChannelQueryProp, InfiniteQueryData, MutationData, QueryData } from '~/query/types';

export type MembersRouteSearchParams = z.infer<typeof membersRouteSearchParamsSchema>;

export type Member = GetMembersResponse['items'][number];
export type PendingMembership = GetPendingMembershipsResponse['items'][number];

export type MemberQueryData = QueryData<Member>;
export type InfiniteMemberQueryData = InfiniteQueryData<Member>;
export type MemberChannelProp = ChannelQueryProp<Member, string | null>;

export type EntityMembershipChannelProp = {
  queryChannel: MemberChannelProp[];
  toastMessage: string;
  entityType?: ChannelEntityType;
};

export type InviteMember = MutationData<MembershipInviteData> & { channelEntity: EnrichedChannelEntity };

export type MutationUpdateMembership = MutationData<UpdateMembershipData> & {
  entityId: string;
  entityType: ChannelEntityType;
};

export type DeleteMembership = MutationData<DeleteMembershipsData> & {
  members: Member[];
};
