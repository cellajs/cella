import type { z } from 'zod';
import type { organizationSchema, organizationWithMembershipSchema } from '#/modules/organizations/schema';

export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationWithMembership = z.infer<typeof organizationWithMembershipSchema>;
