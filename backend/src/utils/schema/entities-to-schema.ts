import { config, type EntityType } from 'config';
import { z } from '@hono/zod-openapi';
// TODO deprecated Zod type
import { ZodTypeAny } from 'zod/v4';

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
