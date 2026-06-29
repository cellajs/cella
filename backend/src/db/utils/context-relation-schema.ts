import { uuid } from 'drizzle-orm/pg-core';
import {
  type AncestorContextType,
  appConfig,
  type EntityIdColumnKey,
  type EntityType,
  hierarchy,
  type ProductEntityType,
  type RelatedContextType,
} from 'shared';

/** Column builder type for a non-null uuid context id column. */
type NotNullUuid = ReturnType<ReturnType<typeof uuid>['notNull']>;
/** Column builder type for a nullable uuid context id column. */
type NullableUuid = ReturnType<typeof uuid>;

/**
 * Context-entity id columns generated for a product entity, derived from the hierarchy:
 * - strict ancestors (parent chain) → non-null id columns
 * - related contexts (`relatedContexts`) → nullable id columns
 *
 * Every strict ancestor is required (non-null): a non-public product entity always physically
 * lives inside exactly one home context (its most-specific parent), and that home is enforced
 * here at the column level. Related contexts are optional cross-links and stay nullable.
 *
 * Column names come from `entityIdColumnKeys` (single source of truth) rather than a
 * re-derived `${C}Id` template literal, so type and runtime stay in lockstep.
 */
export type ContextRelationColumns<E extends string> = {
  [C in AncestorContextType<E> & EntityType as EntityIdColumnKey<C>]: NotNullUuid;
} & {
  [C in RelatedContextType<E> & EntityType as EntityIdColumnKey<C>]: NullableUuid;
};

/**
 * Nullable ancestor-context id columns spanning all product entities. Intended for shared
 * cross-entity tables (e.g. `activities`) that store rows for many entity types at once.
 * Every column is nullable because a given row may not belong to every context.
 */
export type ActivityContextColumns = {
  [C in AncestorContextType<ProductEntityType> & EntityType as EntityIdColumnKey<C>]: NullableUuid;
};

/**
 * Generates context-entity id columns for a product entity based on the hierarchy config.
 * Ancestors (organization, and any intermediate context parents) become non-null columns;
 * declared related contexts become nullable columns. Keeps product schemas fork-agnostic:
 * forks only adjust the hierarchy, not each table definition.
 *
 * The strict-ancestor columns are non-null by design: a non-public product entity must always
 * resolve to a single home context (its most-specific parent). To loosen this, change the
 * hierarchy (e.g. make the entity parentless / public) rather than nullifying a home column.
 *
 * Indexes and foreign keys still live in the table definition (they reference fork-specific
 * parent tables), but the columns and their inferred insert/select types come from here.
 */
export const contextRelationColumns = <E extends ProductEntityType>(entityType: E): ContextRelationColumns<E> => {
  const columns = {} as Record<string, NotNullUuid | NullableUuid>;

  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    columns[appConfig.entityIdColumnKeys[ancestor]] = uuid().notNull();
  }
  for (const related of hierarchy.getRelatedContexts(entityType)) {
    columns[appConfig.entityIdColumnKeys[related]] = uuid();
  }

  return columns as ContextRelationColumns<E>;
};

/**
 * Generates nullable ancestor-context id columns for every product entity in the app.
 * Intended for shared tables that persist rows for multiple entity types (e.g. `activities`).
 * Forks only adjust the hierarchy; the column set follows automatically.
 */
export const activityContextColumns = (): ActivityContextColumns => {
  const columns = {} as Record<string, NullableUuid>;

  for (const ctx of new Set(
    appConfig.productEntityTypes.flatMap((entityType) => hierarchy.getOrderedAncestors(entityType)),
  )) {
    columns[appConfig.entityIdColumnKeys[ctx]] = uuid();
  }

  return columns as ActivityContextColumns;
};
