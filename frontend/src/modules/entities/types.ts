import type { ContextEntityBase, MembershipBase, Organization } from '~/api.gen';

export type EntityData = ContextEntityBase & {
  organizationId?: string;
  membership?: MembershipBase | null;
  counts?: Organization['counts'];
};
