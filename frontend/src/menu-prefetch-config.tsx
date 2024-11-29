import { organizationQueryOptions } from '~/modules/organizations/organization-page';

// Set query client provider queries
export const userMenuPrefetchConfig = {
  organization: {
    queryOptions: organizationQueryOptions,
    prefetchMembers: true,
    prefetchAttachments: true,
  },
} as const;
