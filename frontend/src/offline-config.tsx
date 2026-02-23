import type { ContextEntityType, EntityType } from 'shared';
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
 * Given an entity ID and type, return an array of query options to prefetch related data.
 *
 * When menu is done and offline access is enabled, this mapping function will execute
 * for each entity type defined in the menu.
 */
export const entityToPrefetchQueries = (
  entityId: string,
  entityType: EntityType,
  tenantId: string,
  _organizationId?: string,
) => {
  switch (entityType) {
    case 'organization':
      return [
        membersListQueryOptions({
          entityId: entityId,
          tenantId: tenantId,
          orgId: entityId,
          entityType: entityType,
        }),
      ];

    // Extend switch case for app-specific entity types ...

    // When no matching entity, return empty array or add default set of queries
    default:
      return [];
  }
};
