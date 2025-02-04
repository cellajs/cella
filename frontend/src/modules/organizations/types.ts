import type { z } from 'zod';
import type { invitesSchema, organizationSchema, organizationWithMembershipSchema } from '#/modules/organizations/schema';

export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationInvites = z.infer<typeof invitesSchema>[number];
export type OrganizationWithMembership = z.infer<typeof organizationWithMembershipSchema>;
