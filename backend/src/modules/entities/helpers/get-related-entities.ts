import { type ContextEntityType, config, type ProductEntityType } from 'config';
import { entityTables } from '#/entity-config';

// Define a mapped type to check if field name passed as 'T' exists in each table and filter out 'never' types
export type ValidEntities<T extends (typeof config.entityIdFields)[ContextEntityType]> = Extract<
  {
    [K in ProductEntityType | ContextEntityType]: T extends keyof (typeof entityTables)[K] ? K : never;
  }[ProductEntityType | ContextEntityType],
  string
>;

export const getRelatedEntities = (entityType: ContextEntityType) => {
  const entityIdField = config.entityIdFields[entityType];

  const allEntities = [...config.productEntityTypes, ...config.contextEntityTypes];

  // Only keep entity types that actually contain the ID field we care about
  return allEntities.filter((t) => hasField(t, entityIdField));
};

// Generic type guard function for filtering based on a dynamic field name 'T'
const hasField = <T extends (typeof config.entityIdFields)[ContextEntityType]>(
  entityType: ProductEntityType | ContextEntityType,
  field: T,
): entityType is ValidEntities<T> => {
  const table = entityTables[entityType];
  return field in table;
};
