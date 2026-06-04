import { uuid } from 'drizzle-orm/pg-core';
import {
  type AncestorContextType,
  appConfig,
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
 */
export type ContextRelationColumns<E extends string> = { [C in AncestorContextType<E> as `${C}Id`]: NotNullUuid } & {
  [C in RelatedContextType<E> as `${C}Id`]: NullableUuid;
};

/**
 * Generates context-entity id columns for a product entity based on the hierarchy config.
 * Ancestors (organization, and any intermediate context parents) become non-null columns;
 * declared related contexts become nullable columns. Keeps product schemas fork-agnostic:
 * forks only adjust the hierarchy, not each table definition.
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
