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

type MockChannelIdColumns = EntityIdColumns<ChannelEntityType, string>;

type MockEntityChannelIdColumns<E extends string> = EntityIdColumns<
  (AncestorChannelType<E> | RelatedChannelType<E>) & EntityType,
  string
>;

const mockIdColumns = (entityTypes: Iterable<ChannelEntityType>) => {
  const columns: Record<string, string> = {};
  for (const entityType of entityTypes) {
    columns[appConfig.entityIdColumnKeys[entityType]] = mockUuid();
  }
  return columns;
};

/** Generates all configured channel ID columns. */
export const generateMockChannelIdColumns = (): MockChannelIdColumns =>
  mockIdColumns(appConfig.channelEntityTypes) as MockChannelIdColumns;

/** Generates the hierarchy-derived channel ID columns carried by one product entity. */
export const generateMockEntityChannelIdColumns = <E extends ProductEntityType>(
  entityType: E,
): MockEntityChannelIdColumns<E> =>
  mockIdColumns([
    ...hierarchy.getOrderedAncestors(entityType),
    ...hierarchy.getRelatedChannels(entityType),
  ]) as MockEntityChannelIdColumns<E>;

type MockActivityChannelIdColumns = EntityIdColumns<AncestorChannelType<ProductEntityType> & EntityType, string>;

/** Mirrors the unique strict-ancestor columns in `activityChannelColumns`. */
export const generateMockActivityChannelIdColumns = (): MockActivityChannelIdColumns =>
  mockIdColumns(
    new Set(appConfig.productEntityTypes.flatMap((entityType) => hierarchy.getOrderedAncestors(entityType))),
  ) as MockActivityChannelIdColumns;

/** The root channel entity type (parentless context, e.g. 'organization'), supplied by the route path. */
const rootChannelType = hierarchy.channelTypes.find((t) => hierarchy.getParent(t) === null) as ChannelEntityType;

/**
 * Generates required non-root ancestor and related-channel IDs for create-body mocks.
 * The route supplies the root ID; hierarchy-derived values keep app tests aligned when deeper
 * contexts are added.
 */
export const generateMockEntityBodyChannelIdColumns = <E extends ProductEntityType>(
  entityType: E,
): Omit<MockEntityChannelIdColumns<E>, EntityIdColumnKey<RootChannelType>> =>
  mockIdColumns(
    [...hierarchy.getOrderedAncestors(entityType), ...hierarchy.getRelatedChannels(entityType)].filter(
      (channelType) => channelType !== rootChannelType,
    ),
  ) as Omit<MockEntityChannelIdColumns<E>, EntityIdColumnKey<RootChannelType>>;
