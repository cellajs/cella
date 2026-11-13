import type { MembershipBase, Organization } from 'sdk';
import type { z } from 'zod';
import type { ChannelEnrichment } from '~/modules/entities/types';
import type { organizationsRouteSearchParamsSchema } from '~/modules/organization/search-params-schemas';

export type OrganizationsRouteSearchParams = z.infer<typeof organizationsRouteSearchParamsSchema>;

/** Organization with the ancestor slugs cache enrichment adds. */
export type EnrichedOrganization = Organization & ChannelEnrichment;

/**
 * An organizations table row; `role` holds the caller's role picked in the table while the change saves. It takes the
 * membership's role type: an app's organization may declare fewer roles than a membership carries.
 */
export type OrganizationRow = EnrichedOrganization & { role?: MembershipBase['role'] };
