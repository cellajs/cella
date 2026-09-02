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
} from 'shared';

type NotNullUuid = ReturnType<ReturnType<typeof uuid>['notNull']>;
type NullableUuid = ReturnType<typeof uuid>;
type ChannelTable = AnyPgTable & { id: PgColumn };

/**
 * Channel tables by type, registered by each channel's table module (`registerChannelTable` next
 * to the table). Product tables reference their non-root ancestors through it lazily: drizzle
 * resolves `references` callbacks after every module has loaded, which a direct import between a
 * product table and its ancestor table could not do without an import cycle. The root channel is
 * not referenced here; product tables keep their composite `(tenant_id, <root>_id)` foreign key.
 */
const channelTables = new Map<string, () => ChannelTable>();

export const registerChannelTable = (channelType: ChannelEntityType, table: () => ChannelTable): void => {
  channelTables.set(channelType, table);
};

const referencedChannelId = (channelType: string): PgColumn => {
  const table = channelTables.get(channelType);
  if (!table)
    throw new Error(
      `Channel table for '${channelType}' is not registered; call registerChannelTable in its table module`,
    );
  return table().id;
};

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
