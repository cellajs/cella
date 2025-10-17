import type { ContextEntityBaseSchema, GetContextEntitiesResponse, MembershipBaseSchema, Organization } from '~/api.gen';

export type EntityPage = ContextEntityBaseSchema & {
  membership?: MembershipBaseSchema | null;
  organizationId?: string | null;
  counts?: Organization['counts'];
};

export type ContextEntityItems = GetContextEntitiesResponse['items'];
export type EntityGridItem = ContextEntityItems[number];
