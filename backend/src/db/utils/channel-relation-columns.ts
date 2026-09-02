import { type AnyPgTable, index, type PgColumn, uuid } from 'drizzle-orm/pg-core';
import {
  type AncestorChannelType,
  appConfig,
  type ChannelEntityType,
  type EntityIdColumns,
  type EntityType,
  entityIdColumnName,
  hierarchy,
  type NullableAncestorType,
  type ProductEntityType,
  type RelatedChannelType,
  type RootChannelType,
} from 'shared';
import { channelTables } from '#/db/channel-tables';

type NotNullUuid = ReturnType<ReturnType<typeof uuid>['notNull']>;
type NullableUuid = ReturnType<typeof uuid>;
export type ChannelTable = AnyPgTable & { id: PgColumn };

/**
 * Non-root ancestors and related channels reference their table through the pinned
 * `channel-tables.ts` map, read lazily inside `references` so the import cycle between a channel
 * table and its products is harmless. The root channel is not referenced here; product tables keep
 * their composite `(tenant_id, <root>_id)` foreign key.
 */
const referencedChannelId = (channelType: string): PgColumn =>
  channelTables[channelType as keyof typeof channelTables]().id;

/** Strict ancestors are non-null columns, except declared `nullableAncestors`; `relatedChannels` are nullable. */
export type ChannelRelationColumns<E extends string> = EntityIdColumns<
  Exclude<AncestorChannelType<E>, NullableAncestorType<E>> & EntityType,
  NotNullUuid
> &
  EntityIdColumns<Extract<AncestorChannelType<E>, NullableAncestorType<E>> & EntityType, NullableUuid> &
  EntityIdColumns<RelatedChannelType<E> & EntityType, NullableUuid>;

/** Ancestor-context id columns spanning all product entities, all nullable, for cross-entity tables like `activities`. */
export type ActivityChannelColumns = EntityIdColumns<AncestorChannelType<ProductEntityType> & EntityType, NullableUuid>;

/**
 * From hierarchy config. Non-root ancestor columns cascade-delete with their channel row and
 * related-channel columns null out; table definitions still declare the root's composite foreign
 * key and their own indexes (see {@link channelRelationIndexes}).
 */
export const channelRelationColumns = <E extends ProductEntityType>(entityType: E): ChannelRelationColumns<E> => {
  const nullableAncestors = new Set<string>(hierarchy.getNullableAncestors(entityType));
  const columns = {} as Record<string, NotNullUuid | NullableUuid>;

  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    const column =
      ancestor === hierarchy.rootChannelType
        ? uuid()
        : uuid().references(() => referencedChannelId(ancestor), { onDelete: 'cascade' });
    columns[appConfig.entityIdColumnKeys[ancestor]] = nullableAncestors.has(ancestor) ? column : column.notNull();
  }
  for (const related of hierarchy.getRelatedChannels(entityType)) {
    columns[appConfig.entityIdColumnKeys[related]] = uuid().references(() => referencedChannelId(related), {
      onDelete: 'set null',
    });
  }

  return columns as ChannelRelationColumns<E>;
};

/**
 * One index per non-root ancestor and related-channel column, named `<table>_<column>_index`, for
 * a product table's index list. Empty for org-homed products, so cella's own tables are unchanged.
 */
export const channelRelationIndexes = (
  tableName: string,
  table: Record<string, unknown>,
  entityType: ProductEntityType,
) =>
  [...hierarchy.getOrderedAncestors(entityType), ...hierarchy.getRelatedChannels(entityType)]
    .filter((type) => type !== hierarchy.rootChannelType)
    .map((type) => {
      const column = table[appConfig.entityIdColumnKeys[type]] as PgColumn;
      return index(`${tableName}_${entityIdColumnName(type)}_index`).on(column);
    });

/** One nullable id column per non-root channel type: the channels a membership can be held at below the root. */
export type MembershipChannelColumns = EntityIdColumns<
  Exclude<ChannelEntityType, RootChannelType> & EntityType,
  NullableUuid
>;

/**
 * Sub-root channel columns shared by the membership tables, from hierarchy config: one nullable
 * `<channel>Id` per non-root channel type, cascade-deleting with its channel row. Fresh builders per
 * call, so the two membership tables never share instances; empty for a root-only hierarchy.
 */
export const membershipChannelColumns = (): MembershipChannelColumns => {
  const columns = {} as Record<string, NullableUuid>;

  for (const channelType of appConfig.channelEntityTypes) {
    if (channelType === hierarchy.rootChannelType) continue;
    columns[appConfig.entityIdColumnKeys[channelType]] = uuid().references(() => referencedChannelId(channelType), {
      onDelete: 'cascade',
    });
  }

  return columns as MembershipChannelColumns;
};

/**
 * One `(<channel>_id, user_id, archived)` index per non-root channel, named
 * `<table>_<channel>_user_archived_idx`, for member lookups scoped to a channel. Empty for a
 * root-only hierarchy, so cella's own tables are unchanged.
 */
export const membershipChannelIndexes = (tableName: string, table: Record<string, unknown>) =>
  appConfig.channelEntityTypes
    .filter((channelType) => channelType !== hierarchy.rootChannelType)
    .map((channelType) => {
      const column = table[appConfig.entityIdColumnKeys[channelType]] as PgColumn;
      const channel = entityIdColumnName(channelType).replace(/_id$/, '');
      return index(`${tableName}_${channel}_user_archived_idx`).on(
        column,
        table.userId as PgColumn,
        table.archived as PgColumn,
      );
    });

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
