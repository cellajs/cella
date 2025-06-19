import type { membershipSchema, membershipSummarySchema } from '#/modules/memberships/schema';
import type { memberSchema } from '#/modules/users/schema';
import type { z } from 'zod/v4';
import { zGetByOrgIdOrSlugMembershipsPendingResponse } from '~/openapi-client/zod.gen';

export type Member = z.infer<typeof memberSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type PendingInvitation = z.infer<typeof zGetByOrgIdOrSlugMembershipsPendingResponse>['data']['items'][number];
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;
