import type { ContextEntityType, EntityType } from 'shared';
import { attachmentsListQueryOptions } from '~/modules/attachment/query';
import { membersListQueryOptions } from '~/modules/memberships/query';
import { organizationsListQueryOptions } from '~/modules/organization/query';

/**
 * Query factory type for context entity list queries.
 * Returns infinite query options that produce items extending EnrichedContextEntity with required membership.
 *
 * Uses a structural type to allow different query option signatures while ensuring
 * the queryKey is present. The actual return data type is validated
 * at usage sites via flattenInfiniteData.
 *
 * When adding new context entity types in forks, ensure each query factory
 * returns data compatible with EnrichedContextEntity (with membership).
 *
 * @example
 * ```typescript
 * export const getContextEntityTypeToListQueries = () =>
 *   ({
 *     organization: organizationsListQueryOptions,
 *     workspace: workspacesQueryOptions,
 *   }) satisfies ContextEntityQueryRegistry;
 * ```
 */
export type ContextEntityQueryFactory = (params: { relatableUserId: string }) => {
  queryKey: readonly unknown[];
};

/** Registry mapping context entity types to their query factories. */
export type ContextEntityQueryRegistry = Partial<Record<ContextEntityType, ContextEntityQueryFactory>>;

/**
 * Map entity types to their corresponding list query options functions.
 * This is used to generate the menu based on entity types defined in appConfig.menuStructure.
 *
 * When extending for forks with multiple context entity types, ensure each query factory
 * returns data compatible with EnrichedContextEntity (with membership) for proper type inference.
 */
export const getContextEntityTypeToListQueries = () =>
  ({
    organization: organizationsListQueryOptions,
  }) satisfies ContextEntityQueryRegistry;

/**
 * Given an entity ID (org) and type, return an array of query options for sync.
 * Pure mapping — no seq checks. Staleness is determined by React Query itself
 * (catchup marks lists stale, ensureQueryData skips fresh ones).
 *
 * @param entityId - The context entity ID (e.g., orgId)
 * @param entityType - The context entity type (e.g., 'organization')
 * @param tenantId - Tenant ID for scoped queries
 * @param includeMembers - Whether to include membership queries (controlled by offlineAccess)
 */
export const getEntitySyncQueries = (
  entityId: string,
  entityType: EntityType,
  tenantId: string,
  includeMembers: boolean,
) => {
  const queries: ReturnType<typeof membersListQueryOptions | typeof attachmentsListQueryOptions>[] = [];

  switch (entityType) {
    case 'organization': {
      // Members: only included when offlineAccess is on (eager member caching)
      if (includeMembers) {
        queries.push(
          membersListQueryOptions({
            entityId: entityId,
            tenantId: tenantId,
            orgId: entityId,
            entityType: entityType,
            limit: 200,
          }),
        );
      }

      // Attachments: always included — ensureQueryData skips if cache is fresh
      queries.push(
        attachmentsListQueryOptions({
          tenantId: tenantId,
          orgId: entityId,
        }),
      );

      // Extend with additional product entity types in forks:
      // queries.push(pagesListQueryOptions({ tenantId, orgId: entityId }));

      break;
    }

    // Extend switch case for app-specific entity types ...

    // When no matching entity, return empty array or add default set of queries
    default:
      break;
  }

  return queries;
};
