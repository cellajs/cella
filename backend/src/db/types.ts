import type { appConfig, ContextEntityType } from 'config';
import type { PgColumn, PgVarcharBuilderInitial } from 'drizzle-orm/pg-core';

/**
 * Type representing the column names used to identify an entity using other entities' IDs' as foreign keys.
 */
type ContextEntityTypeIdColumnNames = {
  [K in keyof typeof appConfig.entityIdColumnKeys]: K extends ContextEntityType
    ? (typeof appConfig.entityIdColumnKeys)[K]
    : never;
}[keyof typeof appConfig.entityIdColumnKeys];

/**
 * Necessary to pass type-checking for the generated entity ID columns.
 */
export type GeneratedColumn = PgColumn<{
  name: ContextEntityTypeIdColumnNames;
  tableName: string;
  dataType: 'string';
  columnType: 'PgVarchar';
  data: string;
  driverParam: string;
  notNull: false;
  hasDefault: false;
  isPrimaryKey: false;
  isAutoincrement: false;
  hasRuntimeDefault: false;
  enumValues: [string, ...string[]];
  baseColumn: never;
  generated: undefined;
}>;

export type ContextEntityTypeColumns = {
  [K in ContextEntityTypeIdColumnNames]: PgVarcharBuilderInitial<'', [string, ...string[]], undefined>;
};
