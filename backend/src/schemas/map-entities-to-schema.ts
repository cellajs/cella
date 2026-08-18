import { z } from '@hono/zod-openapi';
import { appConfig, type EntityType } from 'shared';
import type { ZodType } from 'zod';

export const mapEntitiesToSchema = <T extends ZodType>(getSchemaForTable: (tableName: string) => T) => {
  return z.object(
    Object.fromEntries(
      appConfig.entityTypes.map((entityType) => [entityType, getSchemaForTable(entityType)]),
    ) as Record<EntityType, T>,
  );
};
