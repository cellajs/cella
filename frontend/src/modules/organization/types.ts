import type z from 'zod';
import type { Organization } from '~/api.gen';
import type { EntityEnrichment } from '~/modules/entities/types';
import type { organizationsRouteSearchParamsSchema } from '~/modules/organization/search-params-schemas';

export type OrganizationsRouteSearchParams = z.infer<typeof organizationsRouteSearchParamsSchema>;

/** Organization with enrichment data (membership, permissions, ancestor slugs) added via cache enrichment */
export type EnrichedOrganization = Organization & EntityEnrichment;
