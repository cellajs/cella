import { config, ContextEntityType } from 'config';
import type { z } from 'zod/v4';
import { DeleteMembershipsData, UpdateMembershipData } from '~/openapi-client';
import { zGetMembersResponse, zGetPendingInvitationsResponse, zUpdateMembershipResponse } from '~/openapi-client/zod.gen';
import type { ContextQueryProp, InfiniteQueryData, QueryData } from '~/query/types';
export type Member = z.infer<typeof zGetMembersResponse>['items'][number];
export type Membership = z.infer<typeof zUpdateMembershipResponse>;
export type PendingInvitation = z.infer<typeof zGetPendingInvitationsResponse>['items'][number];
export type MembershipSummary = Omit<Membership, 'createdBy' | 'createdAt' | 'modifiedAt' | 'modifiedBy' >
export type MembershipRoles = (typeof config.rolesByType.entityRoles)[number];

export type MemberQueryData = QueryData<Member>;
export type InfiniteMemberQueryData = InfiniteQueryData<Member>;
export type MemberContextProp = ContextQueryProp<Member, string | null>;

export type EntityMembershipContextProp = { queryContext: MemberContextProp[]; toastMessage: string };

type UpdateMembershipProp = NonNullable<UpdateMembershipData['body']> & UpdateMembershipData['path']
export type MutationUpdateMembership = {
  idOrSlug: string;
  entityType: ContextEntityType;
} & UpdateMembershipProp;


export type DeleteMembership = DeleteMembershipsData['query'] & DeleteMembershipsData['path'] & { members: Member[]; };

