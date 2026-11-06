import type { BatchDeleteMembershipsData, InviteMembersData, ListInvitationsResponse, ListMembersResponse, UpdateMembershipData } from 'sdk';
import type { ChannelEntityType } from 'shared';
import type { z } from 'zod';
import type { EnrichedChannel } from '~/modules/entities/types';
import type { membersRouteSearchParamsSchema } from '~/modules/memberships/search-params-schemas';
import type { BaseQueryResponse, MutationData } from '~/query/types';

export type MembersRouteSearchParams = z.infer<typeof membersRouteSearchParamsSchema>;

export type Member = ListMembersResponse['items'][number];
export type PendingMembership = ListInvitationsResponse['items'][number];

export type MemberListSnapshot = BaseQueryResponse<Member>;

export type MemberUpdateContext = { previousLists: MemberListSnapshot[]; toastMessage: string };

export type MembershipInviteVariables = MutationData<InviteMembersData> & { channel: EnrichedChannel };

export type UpdateMembershipVariables = MutationData<UpdateMembershipData> & { channelId: string; channelType: ChannelEntityType };

export type DeleteMembershipsVariables = MutationData<BatchDeleteMembershipsData> & { members: Member[] };
