import type { appConfig, ContextEntityType } from 'config';
import type { z } from 'zod';
import type { DeleteMembershipsData, MembershipInviteData, UpdateMembershipData } from '~/api.gen';
import type { zGetMembersResponse, zGetPendingInvitationsResponse, zUpdateMembershipResponse } from '~/api.gen/zod.gen';
import type { EntityPage } from '~/modules/entities/types';
import type { ContextQueryProp, InfiniteQueryData, QueryData } from '~/query/types';
export type Member = z.infer<typeof zGetMembersResponse>['items'][number];
export type Membership = z.infer<typeof zUpdateMembershipResponse>;
export type PendingInvitation = z.infer<typeof zGetPendingInvitationsResponse>['items'][number];
export type MembershipSummary = Omit<Membership, 'createdBy' | 'createdAt' | 'modifiedAt' | 'modifiedBy'>;
export type MembershipRoles = (typeof appConfig.rolesByType.entityRoles)[number];

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
