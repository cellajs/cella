import { uuid } from 'drizzle-orm/pg-core';
import {
  type AncestorChannelType,
  appConfig,
  type EntityIdColumns,
  type EntityType,
  hierarchy,
  type NullableAncestorType,
  type ProductEntityType,
  type RelatedChannelType,
} from 'shared';

type NotNullUuid = ReturnType<ReturnType<typeof uuid>['notNull']>;
type NullableUuid = ReturnType<typeof uuid>;

/** Strict ancestors are non-null columns, except declared `nullableAncestors`; `relatedChannels` are nullable. */
export type ChannelRelationColumns<E extends string> = EntityIdColumns<
  Exclude<AncestorChannelType<E>, NullableAncestorType<E>> & EntityType,
  NotNullUuid
> &
  EntityIdColumns<Extract<AncestorChannelType<E>, NullableAncestorType<E>> & EntityType, NullableUuid> &
  EntityIdColumns<RelatedChannelType<E> & EntityType, NullableUuid>;

/** Ancestor-context id columns spanning all product entities, all nullable, for cross-entity tables like `activities`. */
export type ActivityChannelColumns = EntityIdColumns<AncestorChannelType<ProductEntityType> & EntityType, NullableUuid>;

/** From hierarchy config; table definitions still declare their own indexes and foreign keys. */
export const channelRelationColumns = <E extends ProductEntityType>(entityType: E): ChannelRelationColumns<E> => {
  const nullableAncestors = new Set<string>(hierarchy.getNullableAncestors(entityType));
  const columns = {} as Record<string, NotNullUuid | NullableUuid>;

  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    columns[appConfig.entityIdColumnKeys[ancestor]] = nullableAncestors.has(ancestor) ? uuid() : uuid().notNull();
  }
  for (const related of hierarchy.getRelatedChannels(entityType)) {
    columns[appConfig.entityIdColumnKeys[related]] = uuid();
  }

  return columns as ChannelRelationColumns<E>;
};

/** Nullable ancestor-context id columns for every product entity, for tables holding rows of several types. */
export const activityChannelColumns = (): ActivityChannelColumns => {
  const columns = {} as Record<string, NullableUuid>;

  for (const ctx of new Set(
    appConfig.productEntityTypes.flatMap((entityType) => hierarchy.getOrderedAncestors(entityType)),
  )) {
    columns[appConfig.entityIdColumnKeys[ctx]] = uuid();
  }

  return columns as ActivityChannelColumns;
};
