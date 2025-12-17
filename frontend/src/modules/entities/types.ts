import type { ContextEntityBase, MembershipBase, Organization } from '~/api.gen';

export type EntityPage = ContextEntityBase & {
  membership?: MembershipBase | null;
  organizationId?: string | null;
  counts?: Organization['counts'];
};
