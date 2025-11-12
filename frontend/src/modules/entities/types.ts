import type { ContextEntityBase, GetContextEntitiesResponse, MembershipBase, Organization } from '~/api.gen';

export type EntityPage = ContextEntityBase & {
  membership?: MembershipBase | null;
  organizationId?: string | null;
  counts?: Organization['counts'];
};

export type ContextEntityItems = GetContextEntitiesResponse['items'];
export type EntityGridItem = ContextEntityItems[number];
