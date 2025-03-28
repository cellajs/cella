import type { z } from 'zod';
import type { memberInvitationsSchema, membersSchema, membershipInfoSchema, membershipSchema } from '#/modules/memberships/schema';

export type Member = z.infer<typeof membersSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type InvitedMember = z.infer<typeof memberInvitationsSchema>;
export type MinimumMembershipInfo = z.infer<typeof membershipInfoSchema>;
