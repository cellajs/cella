import { getTableConfig } from 'drizzle-orm/pg-core';
import { type ZodTypeAny, z } from 'zod';
import { type EntityTableNames, entityTables } from '#/entity-config';

// Map over all the entity tables and create a schema for each with their respective table name
export const mapEntitiesSchema = <T extends ZodTypeAny>(getSchemaForTable: (tableName: string) => T) => {
  return z.object(
    Object.values(entityTables).reduce(
      (acc, table) => {
        const name = getTableConfig(table).name as EntityTableNames;
        acc[name] = getSchemaForTable(name); // Use the passed function to define the schema
        return acc;
      },
      {} as Record<EntityTableNames, T>,
    ),
  );
};

// Map over all the entity tables and create a schema for each with their respective table name
export const mapMenuSectionsSchema = <T extends ZodTypeAny>(getSchemaForTable: (tableName: string) => T) => {
  return z.object(
    Object.values(entityTables).reduce(
      (acc, table) => {
        const name = getTableConfig(table).name as EntityTableNames;
        acc[name] = getSchemaForTable(name); // Use the passed function to define the schema
        return acc;
      },
      {} as Record<EntityTableNames, T>,
    ),
  );
};