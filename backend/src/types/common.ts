import { OpenAPIHono } from '@hono/zod-openapi';
import type { z } from 'zod';

import type { config } from 'config';
import type { Schema } from 'hono';

import type { PgColumn, PgVarcharBuilderInitial } from 'drizzle-orm/pg-core';
import type { entityIdFields } from '#/entity-config';
import type { menuItemSchema, userMenuSchema } from '#/modules/me/schema';
import type { failWithErrorSchema } from '#/utils/schema/common-schemas';
import type { Env } from './app';

export type BaseEntityModel<T extends Entity> = {
  id: string;
  entity: T;
  organizationId?: string;
};

export type Entity = (typeof config.entityTypes)[number];

export type ContextEntity = (typeof config.contextEntityTypes)[number];
export type ContextEntityIdFields = {
  [K in keyof typeof entityIdFields]: K extends ContextEntity ? (typeof entityIdFields)[K] : never;
}[keyof typeof entityIdFields];

export type ProductEntity = (typeof config.productEntityTypes)[number];

export type EnabledOauthProvider = (typeof config.enabledOauthProviders)[number];

export type AllowedAuthStrategies = (typeof config.enabledAuthenticationStrategies)[number];

export type NonEmptyArray<T> = readonly [T, ...T[]];

export type ErrorResponse = z.infer<typeof failWithErrorSchema>;

export type MenuItem = z.infer<typeof menuItemSchema>;
export type UserMenu = z.infer<typeof userMenuSchema>;

// biome-ignore lint/complexity/noBannedTypes: <explanation>
export class CustomHono<E extends Env = Env, S extends Schema = {}, BasePath extends string = '/'> extends OpenAPIHono<E, S, BasePath> {}

export type DynamicColumn = PgColumn<{
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
