import { z } from '@hono/zod-openapi';
import { config, type EntityType } from 'config';
import type { ZodType } from 'zod';

/**
 * Map over all the entities and create a schema for each
 */
export const mapEntitiesToSchema = <T extends ZodType>(getSchemaForTable: (tableName: string) => T) => {
  return z.object(Object.fromEntries(config.entityTypes.map((entityType) => [entityType, getSchemaForTable(entityType)])) as Record<EntityType, T>);
};
