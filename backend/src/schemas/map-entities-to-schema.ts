import { z } from '@hono/zod-openapi';
import { appConfig, type EntityType } from 'shared';

/** An object schema with one field per entity type, each `schemaFor(entityType)`. */
export const mapEntitiesToSchema = <T extends z.ZodType>(schemaFor: (entityType: EntityType) => T) => {
  return z.object(Object.fromEntries(appConfig.entityTypes.map((entityType) => [entityType, schemaFor(entityType)])) as Record<EntityType, T>);
};
