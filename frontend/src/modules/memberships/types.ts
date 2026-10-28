import type { DeleteMembershipsData, GetMembersResponse, GetPendingMembershipsResponse, MembershipInviteData, UpdateMembershipData } from 'sdk';
import type { ChannelEntityType } from 'shared';
import type { z } from 'zod';
import type { EnrichedChannel } from '~/modules/entities/types';
import type { membersRouteSearchParamsSchema } from '~/modules/memberships/search-params-schemas';
import type { BaseQueryResponse, MutationData } from '~/query/types';

export type MembersRouteSearchParams = z.infer<typeof membersRouteSearchParamsSchema>;

export type Member = GetMembersResponse['items'][number];
export type PendingMembership = GetPendingMembershipsResponse['items'][number];

export type MemberListSnapshot = BaseQueryResponse<Member>;

export type MemberUpdateContext = { previousLists: MemberListSnapshot[]; toastMessage: string };

export type MembershipInviteVariables = MutationData<MembershipInviteData> & { channel: EnrichedChannel };

export type UpdateMembershipVariables = MutationData<UpdateMembershipData> & { channelId: string; channelType: ChannelEntityType };

export type DeleteMembershipsVariables = MutationData<DeleteMembershipsData> & { members: Member[] };
