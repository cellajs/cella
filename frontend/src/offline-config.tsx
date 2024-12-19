import { organizationQueryOptions } from '~/modules/organizations/organization-page';
import type { UserMenuItem } from '~/types/common';

import { attachmentsQueryOptions } from '~/modules/attachments/attachments-table/helpers/query-options';
import { membersQueryOptions } from '~/modules/organizations/members-table/helpers/query-options';

// This function returns queries that need to be prefetched based on the entity of the item.
// It is used to prefetch data for each unarchived item in user menu if offlineAccess is enabled, allowing the app to fetch necessary data while offline.
export const queriesToMap = (item: UserMenuItem) => {
  const orgIdOrSlug = item.organizationId ?? item.id;

  // Switch statement to handle different entity types.
  // The entity type will decide which queries should be returned for prefetching.
  switch (item.entity) {
    case 'organization':
      // As example for 'organization' we return the following queries:
      // - queryOptions to fetch the organization itself
      // - queryOptions to fetch members of the organization
      // - queryOptions to fetch attachments related to the organization
      return [
        organizationQueryOptions(item.slug),
        membersQueryOptions({
          idOrSlug: item.slug,
          orgIdOrSlug,
          entityType: item.entity,
        }),
        attachmentsQueryOptions({ orgIdOrSlug }),
      ];

    // Extend the switch case for other entity types as ypu needed for your app

    // In case we don't have a matching entity, return an empty array or add default set of queries
    default:
      return [];
  }
};
