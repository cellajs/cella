import type { z } from 'zod/v4';
import type { MembershipSummary } from '~/modules/memberships/types';
import { zBaseEntitySchema, zGetEntitiesContextResponse } from '~/openapi-client/zod.gen';

export type EntitySummary = z.infer<typeof zBaseEntitySchema>;

export type ContextEntityData = EntitySummary & { membership: MembershipSummary | null };

export type EntityPage = ContextEntityData & {
  organizationId?: string | null;
  invitesCount?: number;
};

export type EntityGreidItems = z.infer<typeof zGetEntitiesContextResponse>['data'];
