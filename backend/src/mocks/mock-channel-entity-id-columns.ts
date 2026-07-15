import {
  type AncestorChannelType,
  appConfig,
  type ChannelEntityType,
  type EntityIdColumnKey,
  type EntityIdColumns,
  type EntityType,
  hierarchy,
  type ProductEntityType,
  type RelatedChannelType,
  type RootChannelType,
} from 'shared';
import { mockUuid } from './mock-nanoid';

/**
 * Type for dynamically generated channel entity ID columns in mocks.
 * Maps each channel entity type to its corresponding ID column (e.g., organization -> organizationId).
 */
export type MockChannelIdColumns = EntityIdColumns<ChannelEntityType, string>;

/**
 * Generates mock ID columns for channel entity types from appConfig.
 * @param mode - 'all' (default) covers all channel entity types; 'relatable' only those in the
 *   hierarchy's relatableChannelTypes.
 */
export const generateMockChannelIdColumns = (mode: 'all' | 'relatable' = 'all'): MockChannelIdColumns => {
  const entityTypes = mode === 'all' ? appConfig.channelEntityTypes : hierarchy.relatableChannelTypes;
  const columns = {} as Record<string, string>;

  for (const entityType of entityTypes) {
    const columnName = appConfig.entityIdColumnKeys[entityType];
    columns[columnName] = mockUuid();
  }

  return columns as MockChannelIdColumns;
};

/**
 * Mock channel entity id columns for a specific product entity, mirroring its DB schema:
 * strict ancestors and declared related contexts (see `channelRelationColumns`).
 */
export type MockEntityChannelIdColumns<E extends string> = EntityIdColumns<
  (AncestorChannelType<E> | RelatedChannelType<E>) & EntityType,
  string
>;

/**
 * Generates the exact set of channel entity id columns a product entity carries, derived from
 * the hierarchy (ancestors + relatedChannels). Keeps mocks fork-agnostic and in sync with schema.
 */
export const generateMockEntityChannelIdColumns = <E extends ProductEntityType>(
  entityType: E,
): MockEntityChannelIdColumns<E> => {
  const columns = {} as Record<string, string>;

  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    columns[appConfig.entityIdColumnKeys[ancestor]] = mockUuid();
  }
  for (const related of hierarchy.getRelatedChannels(entityType)) {
    columns[appConfig.entityIdColumnKeys[related]] = mockUuid();
  }

  return columns as MockEntityChannelIdColumns<E>;
};

/** The root channel entity type (parentless context, e.g. 'organization'), supplied by the route path. */
const rootChannelType = hierarchy.channelTypes.find((t) => hierarchy.getParent(t) === null) as ChannelEntityType;

/**
 * Generates the channel entity id columns a product entity carries in a create-request body, derived
 * from the hierarchy but excluding the root context (e.g. 'organization'), which is supplied by the
 * route path rather than the body. In cella's default hierarchy this yields an empty object, so
 * cella-origin request-body mocks are unchanged; forks that add deeper context relations (e.g. a
 * 'project') get those ids automatically, keeping security/API tests fork-agnostic.
 *
 * The non-root ancestor ids are required (they are always populated), so this satisfies create-body
 * schemas where deeper ancestors (e.g. `projectId`) are mandatory.
 */
export const generateMockEntityBodyChannelIdColumns = <E extends ProductEntityType>(
  entityType: E,
): Omit<MockEntityChannelIdColumns<E>, EntityIdColumnKey<RootChannelType>> => {
  const columns = {} as Record<string, string>;

  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    if (ancestor === rootChannelType) continue;
    columns[appConfig.entityIdColumnKeys[ancestor]] = mockUuid();
  }
  for (const related of hierarchy.getRelatedChannels(entityType)) {
    if (related === rootChannelType) continue;
    columns[appConfig.entityIdColumnKeys[related]] = mockUuid();
  }

  return columns as Omit<MockEntityChannelIdColumns<E>, EntityIdColumnKey<RootChannelType>>;
};
