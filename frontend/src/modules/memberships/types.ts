import type { z } from 'zod';
import type { membersSchema } from '#/modules/general/schema';
import type { membershipInfoSchema, membershipSchema } from '#/modules/memberships/schema';

export type Member = z.infer<typeof membersSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type MinimumMembershipInfo = z.infer<typeof membershipInfoSchema>;
