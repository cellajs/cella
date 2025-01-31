import { z } from 'zod';

import { config } from 'config';
import { type MenuSectionName, menuSections } from '#/entity-config';
import { contextEntityTypeSchema, idOrSlugSchema, idSchema, imageUrlSchema, nameSchema, slugSchema } from '#/utils/schema/common-schemas';
import { membershipInfoSchema } from '../memberships/schema';
import { signUpInfo, userSchema } from '../users/schema';

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
      authStrategy: z.enum(['github', 'google', 'microsoft', 'password', 'passkey']).nullish(),
      type: z.enum(['regular', 'impersonation']),
      expiresAt: z.string(),
      adminUserId: idSchema.nullish(),
      isCurrent: z.boolean(),
    }),
  ),
});

export const meUserSchema = z.object({
  ...userSchema.shape,
  ...signUpInfo.shape,
  ...sessionsSchema.shape,
});

export const menuItemSchema = z.object({
  slug: slugSchema,
  id: idSchema,
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
  menuSections.reduce(
    (acc, section) => {
      acc[section.name] = menuItemsSchema;
      return acc;
    },
    {} as Record<MenuSectionName, typeof menuItemsSchema>,
  ),
);

export const leaveEntityQuerySchema = z.object({
  idOrSlug: idOrSlugSchema,
  entityType: contextEntityTypeSchema,
});
