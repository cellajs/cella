import type { z } from 'zod/v4';
import { zCreateOrganizationResponse, zGetOrganizationResponse } from '~/openapi-client/zod.gen';

export type Organization = z.infer<typeof zGetOrganizationResponse>['data'];
export type OrganizationWithMembership = z.infer<typeof zCreateOrganizationResponse>['data'];
