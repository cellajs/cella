import type { ContextEntityType } from 'config';
import type z from 'zod';
import type { EntityListItemSchema } from '~/api.gen';
import type { zGetContextEntitiesResponse } from '~/api.gen/zod.gen';

export type EntitySummary = Omit<EntityListItemSchema, 'entityType'> & { entityType: ContextEntityType };

export type EntityPage = EntitySummary & {
  organizationId?: string | null;
  invitesCount?: number;
};

export type ContextEntityItems = z.infer<typeof zGetContextEntitiesResponse>['items'];
export type EntityGridItem = ContextEntityItems[ContextEntityType][number];
