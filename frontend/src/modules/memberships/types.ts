import { config } from 'config';
import type { z } from 'zod/v4';
import { zGetMembersResponse, zGetPendingInvitationsResponse, zUpdateMembershipResponse } from '~/openapi-client/zod.gen';

export type Member = z.infer<typeof zGetMembersResponse>['data']['items'][number];
export type Membership = z.infer<typeof zUpdateMembershipResponse>['data'];
export type PendingInvitation = z.infer<typeof zGetPendingInvitationsResponse>['data']['items'][number];
export type MembershipSummary = Omit<Membership, 'createdBy' | 'createdAt' | 'modifiedAt' | 'modifiedBy' >

export type MembershipRoles = (typeof config.rolesByType.entityRoles)[number];
