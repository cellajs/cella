import type { ContextEntityType } from 'shared';
import { attachmentsCanonicalOptions } from '~/modules/attachment/query';
import { membersListQueryOptions } from '~/modules/memberships/query';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import type { BuildEntitySyncQueriesParams, ContextEntityListQueryMap, EntitySyncQueryOptions } from '~/query/types';

/**
 * Maps context entity types to their list query options (used for menu generation).
 *
 * NOTE: Factories are wrapped in arrow functions instead of referenced directly. This defers
 * reading the (ESM live) binding until call time, avoiding a "Cannot access X before initialization"
 * TDZ error when this module is evaluated mid-cycle (e.g. during Vite HMR) before the entity query
 * module has finished initializing. See the circular import chain via `~/query/realtime`.
 */
export const contextEntityListQueriesByType = {
  organization: (params) => organizationsListQueryOptions(params),
} satisfies ContextEntityListQueryMap;

/** Returns query options to sync for a given entity. Pure mapping — staleness is handled by React Query. */
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

  const addMembersQuery = (contextEntityType: ContextEntityType) => {
    if (includeMemberQueries) {
      syncQueries.push(
        membersListQueryOptions({
          entityId: targetEntityId,
          tenantId,
          organizationId: queryOrganizationId,
          entityType: contextEntityType,
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
