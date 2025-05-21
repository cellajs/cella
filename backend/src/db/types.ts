import type { ContextEntity, config } from 'config';
import type { PgColumn, PgVarcharBuilderInitial } from 'drizzle-orm/pg-core';

/**
 * Type representing the fields used to identify an entity within a context entity.
 */
export type ContextEntityIdFields = {
  [K in keyof typeof config.entityIdFields]: K extends ContextEntity ? (typeof config.entityIdFields)[K] : never;
}[keyof typeof config.entityIdFields];

/**
 * Necessary to pass type-checking for the generated columns.
 */
export type GeneratedColumn = PgColumn<{
  name: ContextEntityIdFields;
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

export type ContextEntityColumns = Record<ContextEntityIdFields, PgVarcharBuilderInitial<'', [string, ...string[]], undefined>>;
