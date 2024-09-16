import { getTableConfig } from 'drizzle-orm/pg-core';
import { type ZodTypeAny, z } from 'zod';
import { type EntityTableNames, entityTables } from '#/entity-config';

export const createEntitiesSchema = <T extends ZodTypeAny>(getSchemaForTable: (tableName: string) => T) => {
  return z.object(
    Object.values(entityTables).reduce(
      (acc, table) => {
        const { name } = getTableConfig(table);
        acc[name as EntityTableNames] = getSchemaForTable(name); // Use the passed function to define the schema
        return acc;
      },
      {} as Record<EntityTableNames, T>,
    ),
  );
};
