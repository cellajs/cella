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

/** Non-root ancestor and related-channel IDs for create-body mocks; the route supplies the root ID. */
export const generateMockEntityBodyChannelIdColumns = <E extends ProductEntityType>(
  entityType: E,
): Omit<MockEntityChannelIdColumns<E>, EntityIdColumnKey<RootChannelType>> => {
  // Nullable ancestors are optional placement resolved from real rows server-side, so a
  // create-body mock carries only the required ones; an invented id would never resolve.
  const nullableAncestors = new Set<string>(hierarchy.getNullableAncestors(entityType));
  return mockIdColumns(
    [...hierarchy.getOrderedAncestors(entityType), ...hierarchy.getRelatedChannels(entityType)].filter(
      (channelType) => channelType !== rootChannelType && !nullableAncestors.has(channelType),
    ),
  ) as Omit<MockEntityChannelIdColumns<E>, EntityIdColumnKey<RootChannelType>>;
};
