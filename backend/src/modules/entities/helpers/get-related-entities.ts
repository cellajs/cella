import { appConfig, type ContextEntityType, type ProductEntityType } from 'config';
import { entityTables } from '#/entity-table-config';

// Define a mapped type to check if key name passed as 'T' exists in each table and filter out 'never' types
export type ValidEntities<T extends (typeof appConfig.entityIdColumnKeys)[ContextEntityType]> = Extract<
  {
    [K in ProductEntityType | ContextEntityType]: T extends keyof (typeof entityTables)[K] ? K : never;
  }[ProductEntityType | ContextEntityType],
  string
>;

/**
 * Get a list of entity types that are scoped to a specific context entity type by means of a foreign key.
 */
export const getEntityTypesScopedByContextEntityType = (entityType: ContextEntityType) => {
  const entityIdColumnKey = appConfig.entityIdColumnKeys[entityType];

  const allEntities = [...appConfig.productEntityTypes, ...appConfig.contextEntityTypes];

  // Only keep entity types that actually contain the ID field we care about
  return allEntities.filter((t) => hasColumn(t, entityIdColumnKey));
};

// Generic type guard function for filtering based on a dynamic column key name 'T'
const hasColumn = <T extends (typeof appConfig.entityIdColumnKeys)[ContextEntityType]>(
  entityType: ProductEntityType | ContextEntityType,
  field: T,
): entityType is ValidEntities<T> => {
  const table = entityTables[entityType];
  return field in table;
};
