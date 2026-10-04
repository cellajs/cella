import type { ChannelEntityType } from 'shared';
import { attachmentsCanonicalOptions } from '~/modules/attachment/query';
import { membersListQueryOptions } from '~/modules/memberships/query';
import type { BuildEntitySyncQueriesParams, EntitySyncQueryOptions } from '~/query/types';

/**
 * The queries the sync service warms when a user opens an entity, per target entity type. App-owned
 * (pinned in `cella/cella.config.ts`): which lists are worth prefetching is a product decision, so
 * this stays a hand-written switch. A channel's own menu and search queries live on its module, as
 * `channel.listQuery`.
 *
 * Pure mapping: React Query owns staleness.
 */
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
