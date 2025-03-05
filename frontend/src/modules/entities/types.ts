import type { z } from 'zod';
import type { MinimumMembershipInfo } from '~/modules/memberships/types';
import type { limitEntitySchema } from '#/modules/entities/schema';
import type { membershipsCountSchema } from '#/modules/organizations/schema';

export type LimitedEntity = z.infer<typeof limitEntitySchema>;

export type EntityPage = LimitedEntity & {
  membership: MinimumMembershipInfo | null;
  organizationId?: string | null;
  counts?: z.infer<typeof membershipsCountSchema>;
};
