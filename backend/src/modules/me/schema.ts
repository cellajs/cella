import { z } from 'zod';

import { config } from 'config';
import { idSchema, imageUrlSchema, nameSchema, slugSchema } from '#/utils/schema/common-schemas';
import { membershipInfoSchema } from '../memberships/schema';
import { userSchema } from '../users/schema';

export const sessionSchema = z.object({
  id: idSchema,
  createdAt: z.string(),
  deviceName: z.string().nullish(),
  userId: idSchema,
  deviceType: z.enum(['desktop', 'mobile']),
  deviceOs: z.string().nullish(),
  browser: z.string().nullish(),
  authStrategy: z.enum(['github', 'google', 'microsoft', 'password', 'passkey']).nullish(),
  type: z.enum(['regular', 'impersonation']),
  expiresAt: z.string(),
  adminUserId: idSchema.nullish(),
});

export const signUpInfo = z.object({ oauth: z.array(z.enum(config.enabledOauthProviders)), passkey: z.boolean() });
export const meUserSchema = userSchema.extend({
  sessions: sessionSchema
    .extend({
      isCurrent: z.boolean(),
    })
    .array(),
  ...signUpInfo.shape,
});

export const menuItemSchema = z.object({
  slug: slugSchema,
  id: idSchema,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  name: nameSchema,
  thumbnailUrl: imageUrlSchema.nullish(),
  entity: z.enum(config.contextEntityTypes),
  membership: membershipInfoSchema,
  parentId: z.string().nullable().optional(),
  parentSlug: z.string().optional(),
  organizationId: z.string().optional(),
});

export const menuItemsSchema = z.array(
  z.object({
    ...menuItemSchema.shape,
    submenu: z.array(menuItemSchema).optional(),
  }),
);

export const userMenuSchema = z.object({
  organizations: menuItemsSchema,
  workspaces: menuItemsSchema,
});
