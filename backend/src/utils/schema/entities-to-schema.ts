import { type EntityType, config } from 'config';
import { type ZodTypeAny, z } from 'zod';

/**
 * Map over all the entities and create a schema for each
 */
export const mapEntitiesToSchema = <T extends ZodTypeAny>(getSchemaForTable: (tableName: string) => T) => {
  return z.object(
    Object.fromEntries(Object.entries(config.entityTypes).map(([entityType]) => [entityType, getSchemaForTable(entityType)])) as Record<
      EntityType,
      T
    >,
  );
};
