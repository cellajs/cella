import type { ContextEntityType, EntityType } from 'shared';
import { attachmentsCanonicalOptions } from '~/modules/attachment/query';
import { membersListQueryOptions } from '~/modules/memberships/query';
import { organizationsListQueryOptions } from '~/modules/organization/query';

/** Structural type for query factories — only requires queryKey on return. */
// biome-ignore lint/suspicious/noExplicitAny: Query factories have different parameter shapes per entity type
type ContextEntityQueryFactory = (...args: any[]) => { queryKey: readonly unknown[] };
type ContextEntityQueryRegistry = Partial<Record<ContextEntityType, ContextEntityQueryFactory>>;

/** Maps context entity types to their list query options (used for menu generation). */
export const getContextEntityTypeToListQueries = () =>
  ({
    organization: organizationsListQueryOptions,
  }) satisfies ContextEntityQueryRegistry;

type SyncQueryOptions = ReturnType<typeof membersListQueryOptions | typeof attachmentsCanonicalOptions>;

/** Returns query options to sync for a given entity. Pure mapping — staleness is handled by React Query. */
export const getEntitySyncQueries = (
  entityId: string,
  entityType: EntityType,
  tenantId: string,
  organizationId: string,
  includeMembers: boolean,
) => {
  const queries: SyncQueryOptions[] = [];

  const limit = 200;
  const orgId = entityType === 'organization' ? entityId : organizationId;

  // Only when offlineAccess is enabled, we want to sync members for the entity.
  const pushMembers = (entityType: ContextEntityType) => {
    if (includeMembers)
      queries.push(membersListQueryOptions({ entityId, tenantId, organizationId: orgId, entityType, limit }));
  };

  switch (entityType) {
    case 'organization': {
      pushMembers('organization');
      queries.push(attachmentsCanonicalOptions({ tenantId, organizationId: entityId }));
      break;
    }

    default:
      break;
  }

  return queries;
};
