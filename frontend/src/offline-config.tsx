import type { ContextEntityType, EntityType } from 'config';
import { initAttachmentsCollection } from '~/modules/attachments/collections';
import { membersQueryOptions } from '~/modules/memberships/query';
import { organizationsQueryOptions } from '~/modules/organizations/query';

/**
 * Map entity types to their corresponding list query options functions.
 * This is used to generate the menu based on entity types defined in appConfig.menuStructure.
 */
export const getContextEntityTypeToListQueries = () =>
  ({
    organization: organizationsQueryOptions,
  }) satisfies Partial<Record<ContextEntityType, unknown>>;

/**
 * Given an entity ID and type, return an array of query options to prefetch related data.
 *
 * When menu is done and offline access is enabled, this mapping function will execute
 * for each entity type defined in the menu.
 */
export const entityToPrefetchQueries = (entityId: string, entityType: EntityType, _organizationId?: string) => {
  switch (entityType) {
    case 'organization':
      const attachmentsCollection = initAttachmentsCollection(entityId, true);
      return [
        membersQueryOptions({
          idOrSlug: entityId,
          orgIdOrSlug: entityId,
          entityType: entityType,
        }),
        () => attachmentsCollection.preload(), // Wrap to preserve 'this' context
      ];

    // Extend switch case for app-specific entity types ...

    // When no matching entity, return empty array or add default set of queries
    default:
      return [];
  }
};
