import type { ContextEntityType } from 'config';
import type { ContextEntityBaseSchema, GetContextEntitiesResponse, MembershipBaseSchema } from '~/api.gen';

export type EntityPage = ContextEntityBaseSchema & {
  membership?: MembershipBaseSchema;
  organizationId?: string | null;
  invitesCount?: number;
};

export type ContextEntityItems = GetContextEntitiesResponse['items'];
export type EntityGridItem = ContextEntityItems[ContextEntityType][number];
