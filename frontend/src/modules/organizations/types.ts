import type { z } from 'zod/v4';
import type { zCreateOrganizationResponse, zGetOrganizationResponse } from '~/api.gen/zod.gen';

export type Organization = z.infer<typeof zGetOrganizationResponse>;
export type OrganizationWithMembership = z.infer<typeof zCreateOrganizationResponse>;
