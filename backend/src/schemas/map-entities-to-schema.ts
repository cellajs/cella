import { z } from '@hono/zod-openapi';
import { appConfig, type EntityType } from 'shared';

export const mapEntitiesToSchema = <T extends z.ZodType>(getSchemaForTable: (tableName: string) => T) => {
  return z.object(
    Object.fromEntries(appConfig.entityTypes.map((entityType) => [entityType, getSchemaForTable(entityType)])) as Record<EntityType, T>,
  );
};
