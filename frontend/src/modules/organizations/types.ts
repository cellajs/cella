import type z from 'zod';
import type { MembershipBase, Organization } from '~/api.gen';
import type { organizationsRouteSearchParamsSchema } from '~/modules/organizations/search-params-schemas';

export type OrganizationsRouteSearchParams = z.infer<typeof organizationsRouteSearchParamsSchema>;

export type OrganizationWithMembership = Organization & { membership: NonNullable<MembershipBase> };
