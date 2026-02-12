import { appConfig, type ContextEntityType, hierarchy } from 'shared';
import { mockNanoid } from './mock-nanoid';

/**
 * Type for dynamically generated context entity ID columns in mocks.
 * Maps each context entity type to its corresponding ID column (e.g., organization -> organizationId).
 */
export type MockContextEntityIdColumns = {
  [K in ContextEntityType as (typeof appConfig.entityIdColumnKeys)[K]]: string;
};

/**
 * Generates mock ID columns dynamically based on context entity types from appConfig.
 *
 * @param mode - 'all' includes all context entity types, 'relatable' only includes
 *   those in the hierarchy's relatableContextTypes. Defaults to 'all'.
 * @returns An object with mock ID values for each context entity ID column.
 */
export const generateMockContextEntityIdColumns = (mode: 'all' | 'relatable' = 'all'): MockContextEntityIdColumns => {
  const entityTypes = mode === 'all' ? appConfig.contextEntityTypes : hierarchy.relatableContextTypes;
  const columns = {} as Record<string, string>;

  for (const entityType of entityTypes) {
    const columnName = appConfig.entityIdColumnKeys[entityType];
    columns[columnName] = mockNanoid();
  }

  return columns as MockContextEntityIdColumns;
};
