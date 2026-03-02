import type { ContextEntityType } from 'shared';
import type z from 'zod';
import type {
  DeleteMembershipsData,
  GetMembersResponse,
  GetPendingMembershipsResponse,
  MembershipInviteData,
  UpdateMembershipData,
} from '~/api.gen';
import type { EnrichedContextEntity } from '~/modules/entities/types';
import type { membersRouteSearchParamsSchema } from '~/modules/memberships/search-params-schemas';
import type { ContextQueryProp, InfiniteQueryData, MutationData, QueryData } from '~/query/types';

export type MembersRouteSearchParams = z.infer<typeof membersRouteSearchParamsSchema>;

export type Member = GetMembersResponse['items'][number];
export type PendingMembership = GetPendingMembershipsResponse['items'][number];

export type MemberQueryData = QueryData<Member>;
export type InfiniteMemberQueryData = InfiniteQueryData<Member>;
export type MemberContextProp = ContextQueryProp<Member, string | null>;

export type EntityMembershipContextProp = {
  queryContext: MemberContextProp[];
  toastMessage: string;
  entityType?: ContextEntityType;
};

export type InviteMember = MutationData<MembershipInviteData> & { contextEntity: EnrichedContextEntity };

export type MutationUpdateMembership = MutationData<UpdateMembershipData> & {
  entityId: string;
  entityType: ContextEntityType;
};

export type DeleteMembership = MutationData<DeleteMembershipsData> & {
  members: Member[];
};
