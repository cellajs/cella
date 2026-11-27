import { type AnyPgTable, foreignKey, index, type PgColumn, uuid } from 'drizzle-orm/pg-core';
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
import { channelTables } from '#/db/channel-tables';

type NotNullUuid = ReturnType<ReturnType<typeof uuid>['notNull']>;
type NullableUuid = ReturnType<typeof uuid>;
/** A channel table, as the sub-organization id columns reference it. */
export type ChannelTable = AnyPgTable & { id: PgColumn; tenantId: PgColumn };

/**
 * Sub-organization channel tables come from the pinned `channel-tables.ts` map, read only when drizzle builds a
 * table's references and constraints: the import cycle between a channel table and its products is harmless. The
 * organization is not referenced here; organization-bound tables declare `organizationForeignKey`.
 */
const channelTable = (channelType: ChannelEntityType): ChannelTable => channelTables[channelType]();

/**
 * One composite `(tenant_id, <channel>_id)` key to the channel's `(tenant_id, id)` per channel type below the
 * organization, cascading with the channel row: a row can never name a channel of another tenant. A null id is not
 * checked.
 */
const channelForeignKeys = (table: Record<string, PgColumn>, channelTypes: readonly ChannelEntityType[]) =>
  channelTypes
    .filter((type) => type !== 'organization')
    .map((type) => {
      const channel = channelTable(type);
      const columns: [PgColumn, PgColumn] = [table.tenantId, table[appConfig.entityIdColumnKeys[type]]];
      return foreignKey({ columns, foreignColumns: [channel.tenantId, channel.id] }).onDelete('cascade');
    });

/** Strict ancestors are non-null columns, except declared `nullableAncestors`; `relatedChannels` are nullable. */
type ChannelRelationColumns<E extends string> = EntityIdColumns<Exclude<AncestorChannelType<E>, NullableAncestorType<E>> & EntityType, NotNullUuid> &
  EntityIdColumns<Extract<AncestorChannelType<E>, NullableAncestorType<E>> & EntityType, NullableUuid> &
  EntityIdColumns<RelatedChannelType<E> & EntityType, NullableUuid>;

type ActivityChannelColumns = EntityIdColumns<AncestorChannelType<ProductEntityType> & EntityType, NullableUuid>;

/**
 * From hierarchy config. Ancestor columns take their keys from {@link channelRelationConstraints}; related-channel
 * columns reference their channel by id alone and null out with it.
 */
export const channelRelationColumns = <E extends ProductEntityType>(entityType: E): ChannelRelationColumns<E> => {
  const nullableAncestors = new Set<string>(hierarchy.getNullableAncestors(entityType));
  const columns: Record<string, NotNullUuid | NullableUuid> = {};

  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    columns[appConfig.entityIdColumnKeys[ancestor]] = nullableAncestors.has(ancestor) ? uuid() : uuid().notNull();
  }
  for (const related of hierarchy.getRelatedChannels(entityType)) {
    columns[appConfig.entityIdColumnKeys[related]] = uuid().references(() => channelTable(related).id, { onDelete: 'set null' });
  }

  return columns as ChannelRelationColumns<E>;
};

/**
 * For a product or a channel below the organization: one index per sub-organization ancestor and related-channel
 * column, named `<table>_<column>_index`, and the composite tenant key of each ancestor column. Empty for an
 * organization-homed product, so cella's own tables are unchanged.
 */
export const channelRelationConstraints = (
  tableName: string,
  table: Record<string, PgColumn>,
  entityType: ProductEntityType | Exclude<ChannelEntityType, 'organization'>,
) => {
  const ancestors = hierarchy.getOrderedAncestors(entityType);
  const indexes = [...ancestors, ...hierarchy.getRelatedChannels(entityType)]
    .filter((type) => type !== 'organization')
    .map((type) => index(`${tableName}_${entityIdColumnName(type)}_index`).on(table[appConfig.entityIdColumnKeys[type]]));
  return [...indexes, ...channelForeignKeys(table, ancestors)];
};

type MembershipChannelColumns = EntityIdColumns<Exclude<ChannelEntityType, 'organization'> & EntityType, NullableUuid>;

/**
 * Sub-organization channel columns shared by the membership tables and the LTI tables, from hierarchy config: one
 * nullable `<channel>Id` per sub-organization channel type, keyed by {@link membershipChannelForeignKeys}.
 * Fresh builders per call, so the two membership tables never share instances; empty for an
 * organization-only hierarchy.
 */
export const membershipChannelColumns = (): MembershipChannelColumns => {
  const columns: Record<string, NullableUuid> = {};

  for (const channelType of appConfig.channelEntityTypes) {
    if (channelType === 'organization') continue;
    columns[appConfig.entityIdColumnKeys[channelType]] = uuid();
  }

  return columns as MembershipChannelColumns;
};

/** The composite tenant key of each {@link membershipChannelColumns} column, for the table's constraint list. */
export const membershipChannelForeignKeys = (table: Record<string, PgColumn>) => channelForeignKeys(table, appConfig.channelEntityTypes);

/**
 * One `(<channel>_id, user_id, hidden)` index per sub-organization channel, named
 * `<table>_<channel>_user_hidden_idx`, for member lookups scoped to a channel. Empty for an
 * organization-only hierarchy, so cella's own tables are unchanged.
 */
export const membershipChannelIndexes = (tableName: string, table: Record<string, PgColumn>) =>
  appConfig.channelEntityTypes
    .filter((channelType) => channelType !== 'organization')
    .map((channelType) => {
      const channel = entityIdColumnName(channelType).replace(/_id$/, '');
      return index(`${tableName}_${channel}_user_hidden_idx`).on(table[appConfig.entityIdColumnKeys[channelType]], table.userId, table.hidden);
    });

/** Nullable ancestor-context id columns for every product entity, for tables holding rows of several types. */
export const activityChannelColumns = (): ActivityChannelColumns => {
  const columns: Record<string, NullableUuid> = {};

  const ancestorTypes = new Set(appConfig.productEntityTypes.flatMap((entityType) => hierarchy.getOrderedAncestors(entityType)));
  for (const channelType of ancestorTypes) columns[appConfig.entityIdColumnKeys[channelType]] = uuid();

  return columns as ActivityChannelColumns;
};
