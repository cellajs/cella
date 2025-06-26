import { z } from '@hono/zod-openapi';
import { config, type EntityType } from 'config';
// TODO deprecated Zod type
import type { ZodTypeAny } from 'zod/v4';

/**
 * Map over all the entities and create a schema for each
 */
export const mapEntitiesToSchema = <T extends ZodTypeAny>(getSchemaForTable: (tableName: string) => T) => {
  return z.object(Object.fromEntries(config.entityTypes.map((entityType) => [entityType, getSchemaForTable(entityType)])) as Record<EntityType, T>);
};
