import type { z } from 'zod';
import type { zCreateOrganizationResponse, zGetOrganizationResponse, zGetOrganizationsResponse } from '~/api.gen/zod.gen';

export type Organization = z.infer<typeof zGetOrganizationResponse>;
export type OrganizationWithMembership = z.infer<typeof zCreateOrganizationResponse>;
export type TableOrganization = z.infer<typeof zGetOrganizationsResponse>['items'][number];
