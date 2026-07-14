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

/** Column builder type for a non-null uuid context id column. */
type NotNullUuid = ReturnType<ReturnType<typeof uuid>['notNull']>;
/** Column builder type for a nullable uuid context id column. */
type NullableUuid = ReturnType<typeof uuid>;

/**
 * Context-entity id columns generated for a product entity, derived from the hierarchy:
 * - strict ancestors (parent chain) → non-null id columns, unless declared in the hierarchy's
 *   `nullableAncestors` (variable-depth rows, e.g. a project-scoped entity that may also exist
 *   at a higher level), those stay in the chain for permission/public-read inheritance but
 *   become nullable columns
 * - related contexts (`relatedChannels`) → nullable id columns
 */
export type ChannelRelationColumns<E extends string> = EntityIdColumns<
  Exclude<AncestorChannelType<E>, NullableAncestorType<E>> & EntityType,
  NotNullUuid
> &
  EntityIdColumns<Extract<AncestorChannelType<E>, NullableAncestorType<E>> & EntityType, NullableUuid> &
  EntityIdColumns<RelatedChannelType<E> & EntityType, NullableUuid>;

/**
 * Nullable ancestor-context id columns spanning all product entities. Intended for shared
 * cross-entity tables (e.g. `activities`) that store rows for many entity types at once.
 * Every column is nullable because a given row may not belong to every context.
 */
export type ActivityChannelColumns = EntityIdColumns<AncestorChannelType<ProductEntityType> & EntityType, NullableUuid>;

/**
 * Generates context-entity id columns for a product entity based on the hierarchy config.
 * Ancestors (organization, and any intermediate context parents) become non-null columns;
 * except ancestors the hierarchy declares in `nullableAncestors` (variable-depth rows);
 * declared related contexts become nullable columns. Keeps product schemas fork-agnostic:
 * forks only adjust the hierarchy, not each table definition.
 *
 * Indexes and foreign keys still live in the table definition (they reference fork-specific
 * parent tables), but the columns and their inferred insert/select types come from here.
 */
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

/**
 * Generates nullable ancestor-context id columns for every product entity in the app.
 * Intended for shared tables that persist rows for multiple entity types (e.g. `activities`).
 * Forks only adjust the hierarchy; the column set follows automatically.
 */
export const activityChannelColumns = (): ActivityChannelColumns => {
  const columns = {} as Record<string, NullableUuid>;

  for (const ctx of new Set(
    appConfig.productEntityTypes.flatMap((entityType) => hierarchy.getOrderedAncestors(entityType)),
  )) {
    columns[appConfig.entityIdColumnKeys[ctx]] = uuid();
  }

  return columns as ActivityChannelColumns;
};
