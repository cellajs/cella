import type { ContextEntityBase, MembershipBase, Organization } from '~/api.gen';

export type ContextEntityData = ContextEntityBase & {
  organizationId?: string;
  /** Membership data - populated via cache enrichment from myMemberships */
  membership?: MembershipBase | null;
  /** Included wrapper for optional data from API (membership, counts) */
  included?: Organization['included'];
  can?: Organization['can'];
};
