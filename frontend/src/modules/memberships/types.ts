import type { z } from 'zod';
import type { membershipSchema, membershipSummarySchema, pendingInvitationSchema } from '#/modules/memberships/schema';
import type { memberSchema } from '#/modules/users/schema';

export type Member = z.infer<typeof memberSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type PendingInvitation = z.infer<typeof pendingInvitationSchema>;
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;
