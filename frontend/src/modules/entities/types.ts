import type { z } from 'zod';
import type { MembershipSummary } from '~/modules/memberships/types';
import type { contextEntitiesSchema, entityBaseSchema } from '#/modules/entities/schema';
import type { membershipCountSchema } from '#/modules/organizations/schema';

export type EntitySummary = z.infer<typeof entityBaseSchema>;

export type ContextEntityData = EntitySummary & { membership: MembershipSummary | null };

export type EntityPage = ContextEntityData & {
  organizationId?: string | null;
  counts?: z.infer<typeof membershipCountSchema>;
};

export type EntityGreidItems = z.infer<typeof contextEntitiesSchema>;
