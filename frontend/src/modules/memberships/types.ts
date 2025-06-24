import { config, type ContextEntityType } from 'config';
import type { z } from 'zod/v4';
import { zGetMembersResponse, zGetPendingInvitationsResponse, zUpdateMembershipResponse } from '~/openapi-client/zod.gen';
import type { UpdateMembershipProp } from '~/modules/memberships/api';
import type { ContextQueryProp, InfiniteQueryData, QueryData } from '~/query/types';

export type Member = z.infer<typeof zGetMembersResponse>['data']['items'][number];
export type Membership = z.infer<typeof zUpdateMembershipResponse>['data'];
export type PendingInvitation = z.infer<typeof zGetPendingInvitationsResponse>['data']['items'][number];
export type MembershipSummary = Omit<Membership, 'createdBy' | 'createdAt' | 'modifiedAt' | 'modifiedBy' >
export type MembershipRoles = (typeof config.rolesByType.entityRoles)[number];

export type MemberQueryData = QueryData<Member>;
export type InfiniteMemberQueryData = InfiniteQueryData<Member>;
export type MemberContextProp = ContextQueryProp<Member, string | null>;

export type EntityMembershipContextProp = { queryContext: MemberContextProp[]; toastMessage: string };

export type MutationUpdateMembership = {
  idOrSlug: string;
  entityType: ContextEntityType;
} & UpdateMembershipProp;
