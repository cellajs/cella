import type { ContextEntityBase, MembershipBase, Organization } from '~/api.gen';

export type ContextEntityData = ContextEntityBase & {
  organizationId?: string;
  membership?: MembershipBase | null;
  counts?: Organization['counts'];
  can?: Organization['can'];
};
