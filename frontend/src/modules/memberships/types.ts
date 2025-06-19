import type { z } from 'zod/v4';
import { zGetByOrgIdOrSlugMembershipsMembersResponse, zGetByOrgIdOrSlugMembershipsPendingResponse, zPutByOrgIdOrSlugMembershipsByIdResponse } from '~/openapi-client/zod.gen';

export type Member = z.infer<typeof zGetByOrgIdOrSlugMembershipsMembersResponse>['data']['items'][number];
export type Membership = z.infer<typeof zPutByOrgIdOrSlugMembershipsByIdResponse>['data'];
export type PendingInvitation = z.infer<typeof zGetByOrgIdOrSlugMembershipsPendingResponse>['data']['items'][number];
export type MembershipSummary = Omit<Membership, 'createdBy' | 'createdAt' | 'modifiedAt' | 'modifiedBy' >
