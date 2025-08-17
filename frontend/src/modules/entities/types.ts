import type { z } from 'zod';
import type { zContextEntityBaseSchema, zGetEntitiesWithAdminsResponse } from '~/api.gen/zod.gen';
import type { MembershipSummary } from '~/modules/memberships/types';

export type EntitySummary = z.infer<typeof zContextEntityBaseSchema>;

export type ContextEntityData = EntitySummary & { membership: MembershipSummary | null };

export type EntityPage = ContextEntityData & {
  organizationId?: string | null;
  invitesCount?: number;
};

// We have getContext and getPageEntities, make more clear which is which
export type EntityGridItem = z.infer<typeof zGetEntitiesWithAdminsResponse>[number];
