import type { z } from 'zod';

import type { config } from 'config';

import type { entityIdFields } from '#/entity-config';
import type { menuItemSchema, userMenuSchema } from '#/modules/me/schema';
import type { failWithErrorSchema } from '#/utils/schema/common-schemas';

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
