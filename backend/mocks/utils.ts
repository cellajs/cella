import { faker } from '@faker-js/faker';
import { appConfig, type ContextEntityType } from 'config';
import { relatableContextEntityTables } from '#/relatable-config';

/**
 * Generates a random ISO date in the past.
 * @returns An ISO 8601 string representing a past date.
 */
export const pastIsoDate = () => faker.date.past().toISOString();

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
      columns[columnName] = faker.string.nanoid();
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

/**
 * Converts a string key to a numeric seed for faker.
 * Uses a simple hash function for consistent results.
 */
const stringToSeed = (key: string): number => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
};

/**
 * Runs a generator function with a deterministic faker seed.
 * The same key will always produce the same fake data.
 * Useful for OpenAPI examples and reproducible tests.
 *
 * @param key - A unique string key to seed the random generator.
 * @param generator - Function that generates fake data using faker.
 * @returns The result of the generator function.
 */
export const withFakerSeed = <T>(key: string, generator: () => T): T => {
  faker.seed(stringToSeed(key));
  const result = generator();
  faker.seed(); // Reset to random seed
  return result;
};
