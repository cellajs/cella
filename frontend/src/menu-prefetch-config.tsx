import { organizationQueryOptions } from '~/modules/organizations/organization-page';
import type { UserMenuItem } from '~/types/common';

// Set query client provider queries
export const userMenuPrefetchConfig = {
  organization: {
    prefetchMembers: true,
    prefetchAttachments: true,
  },
} as const;

export const mapQuery = (item: UserMenuItem) => {
  switch (item.entity) {
    case 'organization':
      return organizationQueryOptions(item.slug);
  }
};
