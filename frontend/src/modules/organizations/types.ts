import type { MembershipBaseSchema, Organization } from '~/api.gen';

export type OrganizationWithMembership = Organization & { membership: MembershipBaseSchema };
