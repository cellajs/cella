import type z from 'zod';
import type { MembershipBase, Organization } from '~/api.gen';
import type { organizationsRouteSearchParamsSchema } from '~/modules/organization/search-params-schemas';

export type OrganizationsRouteSearchParams = z.infer<typeof organizationsRouteSearchParamsSchema>;

/** Organization with membership added via cache enrichment */
export type OrganizationWithMembership = Organization & { membership?: MembershipBase };
