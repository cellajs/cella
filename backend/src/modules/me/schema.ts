import { z } from 'zod';

import { config } from 'config';
import { type MenuSectionName, entityRelations } from '#/entity-config';
import { contextEntityTypeSchema, idOrSlugSchema, idSchema, imageUrlSchema, nameSchema, slugSchema } from '#/utils/schema/common';
import { membershipInfoSchema } from '../memberships/schema';
import { signUpInfo } from '../users/schema';

// TODO use session db schema?
export const sessionsSchema = z.object({
  sessions: z.array(
    z.object({
      id: idSchema,
      createdAt: z.string(),
      deviceName: z.string().nullish(),
      userId: idSchema,
      deviceType: z.enum(['desktop', 'mobile']),
      deviceOs: z.string().nullish(),
      browser: z.string().nullish(),
      //TODO use enum from config?
      authStrategy: z.enum(['github', 'google', 'microsoft', 'password', 'passkey']).nullish(),
      type: z.enum(['regular', 'impersonation']),
      expiresAt: z.string(),
      adminUserId: idSchema.nullish(),
      isCurrent: z.boolean(),
    }),
  ),
});

export const meAuthInfoSchema = z.object({
  ...signUpInfo.shape,
  ...sessionsSchema.shape,
});

// TODO this is also minimum entity schema?
export const menuItemSchema = z.object({
  slug: slugSchema,
  id: idSchema,
  // TODO always timestamp but not here?
  createdAt: z.date(),
  modifiedAt: z.date().nullable(),
  name: nameSchema,
  thumbnailUrl: imageUrlSchema.nullish(),
  entity: z.enum(config.contextEntityTypes),
  membership: membershipInfoSchema,
  organizationId: membershipInfoSchema.shape.organizationId.optional(),
});

export const menuItemsSchema = z.array(
  z.object({
    ...menuItemSchema.shape,
    submenu: z.array(menuItemSchema).optional(),
  }),
);

// Create a menu schema based on menu sections in entity-config
export const userMenuSchema = z.object(
  entityRelations.reduce(
    (acc, { menuSectionName }) => {
      acc[menuSectionName] = menuItemsSchema;
      return acc;
    },
    {} as Record<MenuSectionName, typeof menuItemsSchema>,
  ),
);

export const leaveEntityQuerySchema = z.object({
  idOrSlug: idOrSlugSchema,
  entityType: contextEntityTypeSchema,
});
