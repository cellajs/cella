import type { z } from 'zod';
import type { MembershipSummary } from '~/modules/memberships/types';
import type { entityBaseSchema } from '#/modules/entities/schema';
import type { membershipCountSchema } from '#/modules/organizations/schema';

export type EntitySummary = z.infer<typeof entityBaseSchema>;

export type EntityPage = EntitySummary & {
  membership: MembershipSummary | null;
  organizationId?: string | null;
  counts?: z.infer<typeof membershipCountSchema>;
};
