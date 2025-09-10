import type z from 'zod';
import type { MembershipBaseSchema, Organization } from '~/api.gen';
import type { organizationsRouteSearchParamsSchema } from '~/routes/search-params-schemas';

export type OrganizationsRouteSearchParams = z.infer<typeof organizationsRouteSearchParamsSchema>;

export type OrganizationWithMembership = Organization & { membership: MembershipBaseSchema };
