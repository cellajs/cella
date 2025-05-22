import type { ContextEntityType, config } from 'config';
import type { PgColumn, PgVarcharBuilderInitial } from 'drizzle-orm/pg-core';

/**
 * Type representing the fields used to identify an entity within a context entity.
 */
export type ContextEntityTypeIdFields = {
  [K in keyof typeof config.entityIdFields]: K extends ContextEntityType ? (typeof config.entityIdFields)[K] : never;
}[keyof typeof config.entityIdFields];

/**
 * Necessary to pass type-checking for the generated columns.
 */
export type GeneratedColumn = PgColumn<{
  name: ContextEntityTypeIdFields;
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

export type ContextEntityTypeColumns = Record<ContextEntityTypeIdFields, PgVarcharBuilderInitial<'', [string, ...string[]], undefined>>;
