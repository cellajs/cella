import type { z } from 'zod';
import type { MembershipBaseSchema, Organization } from '~/api.gen';
import type { zGetOrganizationsResponse } from '~/api.gen/zod.gen';

export type OrganizationWithMembership = Organization & { membership: Exclude<MembershipBaseSchema, null> };
export type TableOrganization = z.infer<typeof zGetOrganizationsResponse>['items'][number];
