import type { membershipSchema, membershipSummarySchema, pendingInvitationSchema } from '#/modules/memberships/schema';
import type { memberSchema } from '#/modules/users/schema';
import type { config } from 'config';
import type { z } from 'zod';

export type Member = z.infer<typeof memberSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type PendingInvitation = z.infer<typeof pendingInvitationSchema>;
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;

export type MembershipRoles = (typeof config.rolesByType.entityRoles)[number];
