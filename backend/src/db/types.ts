import type { PgColumn, PgVarcharBuilderInitial } from 'drizzle-orm/pg-core';
import type { ContextEntityIdFields } from '#/entity-config';

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
