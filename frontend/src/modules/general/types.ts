import type { z } from 'zod';
import type { MinimumMembershipInfo } from '~/modules/memberships/types';
import type { limitEntitySchema } from '#/modules/general/schema';

export type LimitedEntity = z.infer<typeof limitEntitySchema>;

export type EntityPage = LimitedEntity & {
  organizationId?: string | null;
  membership: MinimumMembershipInfo | null;
};
