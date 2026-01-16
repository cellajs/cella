import { appConfig, type ContextEntityType } from 'config';
import { relatableContextEntityTables } from '#/relatable-config';
import { mockNanoid } from './mock-nanoid';

/**
 * Type for dynamically generated context entity ID columns in mocks.
 * Maps each context entity type to its corresponding ID column (e.g., organization -> organizationId).
 */
export type MockContextEntityIdColumns = {
  [K in ContextEntityType as (typeof appConfig.entityIdColumnKeys)[K]]: string;
};

type ContextEntityConfig = {
  contextEntityTypes: readonly string[];
  entityIdColumnKeys: Record<string, string>;
};

/**
 * Generates mock ID columns dynamically based on context entity types.
 * Accepts config parameter for testability.
 *
 * @param config - Configuration with contextEntityTypes and entityIdColumnKeys.
 * @returns An object with ID columns for all context entity types.
 */
export const generateMockContextEntityIdColumnsWithConfig = <T extends ContextEntityConfig>(
  config: T,
): Record<string, string> =>
  config.contextEntityTypes.reduce(
    (columns, entityType) => {
      const columnName = config.entityIdColumnKeys[entityType];
      columns[columnName] = mockNanoid();
      return columns;
    },
    {} as Record<string, string>,
  );

/** Relatable context entity types derived from relatableContextEntityTables. */
const relatableContextEntityTypes = Object.keys(relatableContextEntityTables) as ContextEntityType[];

/**
 * Generates mock ID columns dynamically based on context entity types.
 * Similar to generateContextEntityIdColumns for DB schemas, but for mock data.
 *
 * @param mode - 'all' includes all context entity types from appConfig, 'relatable' only includes those from relatableContextEntityTables. Defaults to 'all'.
 * @returns An object with ID columns for context entity types.
 */
export const generateMockContextEntityIdColumns = (mode: 'all' | 'relatable' = 'all'): MockContextEntityIdColumns => {
  const entityTypes = mode === 'all' ? appConfig.contextEntityTypes : relatableContextEntityTypes;
  const config = {
    contextEntityTypes: entityTypes,
    entityIdColumnKeys: appConfig.entityIdColumnKeys,
  };
  return generateMockContextEntityIdColumnsWithConfig(config) as MockContextEntityIdColumns;
};
