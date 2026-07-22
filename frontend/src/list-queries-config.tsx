import type { ChannelEntityType } from 'shared';
import { attachmentsCanonicalOptions } from '~/modules/attachment/query';
import { membersListQueryOptions } from '~/modules/memberships/query';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import type { BuildEntitySyncQueriesParams, ChannelListQueryMap, EntitySyncQueryOptions } from '~/query/types';

/**
 * Maps channel entity types to their list query options (used for menu generation).
 */
export const channelListQueriesByType = {
  organization: (params) => organizationsListQueryOptions(params),
} satisfies ChannelListQueryMap;

/** Returns query options to sync for a given entity. React Query handles staleness. */
export const buildEntitySyncQueries = ({
  targetEntityId,
  targetEntityType,
  tenantId,
  currentOrganizationId,
  includeMemberQueries,
}: BuildEntitySyncQueriesParams) => {
  const syncQueries: EntitySyncQueryOptions[] = [];

  const memberListLimit = 200;
  const queryOrganizationId = targetEntityType === 'organization' ? targetEntityId : currentOrganizationId;

  const addMembersQuery = (channelEntityType: ChannelEntityType) => {
    if (includeMemberQueries) {
      syncQueries.push(
        membersListQueryOptions({
          entityId: targetEntityId,
          tenantId,
          organizationId: queryOrganizationId,
          entityType: channelEntityType,
          limit: memberListLimit,
        }),
      );
    }
  };

  switch (targetEntityType) {
    case 'organization': {
      addMembersQuery('organization');
      syncQueries.push(attachmentsCanonicalOptions({ tenantId, organizationId: targetEntityId }));
      break;
    }

    default:
      break;
  }

  return syncQueries;
};
