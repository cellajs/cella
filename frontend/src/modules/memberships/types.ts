import type { ContextEntityType } from 'shared';
import type z from 'zod';
import type {
  GetMembersResponse,
  GetPendingMembershipsResponse,
  MembershipInviteData,
  UpdateMembershipData,
  UpdateMembershipResponse,
} from '~/api.gen';
import type { ContextEntityData } from '~/modules/entities/types';
import type { membersRouteSearchParamsSchema } from '~/modules/memberships/search-params-schemas';
import type { ContextQueryProp, InfiniteQueryData, QueryData } from '~/query/types';

export type MembersRouteSearchParams = z.infer<typeof membersRouteSearchParamsSchema>;

export type Member = GetMembersResponse['items'][number];
export type Membership = UpdateMembershipResponse;
export type PendingMembership = GetPendingMembershipsResponse['items'][number];

export type MemberQueryData = QueryData<Member>;
export type InfiniteMemberQueryData = InfiniteQueryData<Member>;
export type MemberContextProp = ContextQueryProp<Member, string | null>;

export type EntityMembershipContextProp = { queryContext: MemberContextProp[]; toastMessage: string };

export type InviteMember = NonNullable<MembershipInviteData['body']> & { entity: ContextEntityData };

type UpdateMembershipProp = NonNullable<UpdateMembershipData['body']> & UpdateMembershipData['path'];
export type MutationUpdateMembership = {
  entityId: string;
  entityType: ContextEntityType;
} & UpdateMembershipProp;

export type DeleteMembership = {
  entityId: string;
  entityType: ContextEntityType;
  tenantId: string;
  orgId: string;
  members: Member[];
};
