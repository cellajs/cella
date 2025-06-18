import type { z } from 'zod';
import type { contextEntitiesSchema, entityBaseSchema } from '#/modules/entities/schema';
import type { MembershipSummary } from '~/modules/memberships/types';

export type EntitySummary = z.infer<typeof entityBaseSchema>;

export type ContextEntityData = EntitySummary & { membership: MembershipSummary | null };

export type EntityPage = ContextEntityData & {
  organizationId?: string | null;
  invitesCount?: number;
};

export type EntityGreidItems = z.infer<typeof contextEntitiesSchema>;
