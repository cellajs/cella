import {
  type AncestorContextType,
  appConfig,
  type ContextEntityType,
  hierarchy,
  type ProductEntityType,
  type RelatedContextType,
} from 'shared';
import { mockUuid } from './mock-nanoid';

/**
 * Type for dynamically generated context entity ID columns in mocks.
 * Maps each context entity type to its corresponding ID column (e.g., organization -> organizationId).
 */
export type MockContextIdColumns = {
  [K in ContextEntityType as (typeof appConfig.entityIdColumnKeys)[K]]: string;
};

/**
 * Generates mock ID columns dynamically based on context entity types from appConfig.
 *
 * @param mode - 'all' includes all context entity types, 'relatable' only includes
 *   those in the hierarchy's relatableContextTypes. Defaults to 'all'.
 * @returns An object with mock ID values for each context entity ID column.
 */
export const generateMockContextIdColumns = (mode: 'all' | 'relatable' = 'all'): MockContextIdColumns => {
  const entityTypes = mode === 'all' ? appConfig.contextEntityTypes : hierarchy.relatableContextTypes;
  const columns = {} as Record<string, string>;

  for (const entityType of entityTypes) {
    const columnName = appConfig.entityIdColumnKeys[entityType];
    columns[columnName] = mockUuid();
  }

  return columns as MockContextIdColumns;
};

/**
 * Mock context-entity id columns for a specific product entity, mirroring its DB schema:
 * strict ancestors and declared related contexts (see `contextRelationColumns`).
 */
export type MockEntityContextIdColumns<E extends string> = {
  [C in AncestorContextType<E> as `${C}Id`]: string;
} & {
  [C in RelatedContextType<E> as `${C}Id`]: string;
};

/**
 * Generates the exact set of context-entity id columns a product entity carries, derived from
 * the hierarchy (ancestors + relatedContexts). Keeps mocks fork-agnostic and in sync with schema.
 */
export const generateMockEntityContextIdColumns = <E extends ProductEntityType>(
  entityType: E,
): MockEntityContextIdColumns<E> => {
  const columns = {} as Record<string, string>;

  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    columns[appConfig.entityIdColumnKeys[ancestor]] = mockUuid();
  }
  for (const related of hierarchy.getRelatedContexts(entityType)) {
    columns[appConfig.entityIdColumnKeys[related]] = mockUuid();
  }

  return columns as MockEntityContextIdColumns<E>;
};

/** The root context entity type (parentless context, e.g. 'organization'), supplied by the route path. */
const rootContextType = hierarchy.contextTypes.find((t) => hierarchy.getParent(t) === null) as ContextEntityType;

/**
 * Generates the context-entity id columns a product entity carries in a create-request body, derived
 * from the hierarchy but excluding the root context (e.g. 'organization'), which is supplied by the
 * route path rather than the body. In cella's default hierarchy this yields an empty object, so
 * cella-origin request-body mocks are unchanged; forks that add deeper context relations (e.g. a
 * 'project') get those ids automatically, keeping security/API tests fork-agnostic.
 */
export const generateMockEntityBodyContextIdColumns = <E extends ProductEntityType>(
  entityType: E,
): Partial<MockEntityContextIdColumns<E>> => {
  const columns = {} as Record<string, string>;

  for (const ancestor of hierarchy.getOrderedAncestors(entityType)) {
    if (ancestor === rootContextType) continue;
    columns[appConfig.entityIdColumnKeys[ancestor]] = mockUuid();
  }
  for (const related of hierarchy.getRelatedContexts(entityType)) {
    if (related === rootContextType) continue;
    columns[appConfig.entityIdColumnKeys[related]] = mockUuid();
  }

  return columns as Partial<MockEntityContextIdColumns<E>>;
};
