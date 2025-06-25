import type { z } from 'zod/v4';
import type { MembershipSummary } from '~/modules/memberships/types';
import { zBaseEntitySchema, zGetContextEntitiesResponse } from '~/openapi-client/zod.gen';

export type EntitySummary = z.infer<typeof zBaseEntitySchema>;

export type ContextEntityData = EntitySummary & { membership: MembershipSummary | null };

export type EntityPage = ContextEntityData & {
  organizationId?: string | null;
  invitesCount?: number;
};

// We have getContext and getPageEntities, make more clear which is which
export type EntityGridItem = z.infer<typeof zGetContextEntitiesResponse>[number];
