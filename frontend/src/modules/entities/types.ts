import type { ContextEntityType } from 'config';
import type z from 'zod';
import type { ContextEntityBaseSchema } from '~/api.gen';
import type { zGetContextEntitiesResponse } from '~/api.gen/zod.gen';

export type EntityPage = ContextEntityBaseSchema & {
  organizationId?: string | null;
  invitesCount?: number;
};

export type ContextEntityItems = z.infer<typeof zGetContextEntitiesResponse>['items'];
export type EntityGridItem = ContextEntityItems[ContextEntityType][number];
