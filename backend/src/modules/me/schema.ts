import { z } from 'zod';

import { config } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { sessionsTable } from '#/db/schema/sessions';
import { type MenuSectionName, entityRelations } from '#/entity-config';
import { limitEntitySchema } from '#/modules/entities/schema';
import { membershipInfoSchema } from '#/modules/memberships/schema';
import { enabledOauthProvidersEnum } from '#/modules/users/schema';
import { booleanQuerySchema, contextEntityTypeSchema, idOrSlugSchema } from '#/utils/schema/common';

export const sessionSchema = createSelectSchema(sessionsTable).omit({ token: true }).extend({ isCurrent: z.boolean() });

export const meAuthInfoSchema = z.object({
  oauth: z.array(enabledOauthProvidersEnum),
  passkey: z.boolean(),
  sessions: z.array(sessionSchema.extend({ expiresAt: z.string() })),
});

export const menuItemSchema = limitEntitySchema.omit({ bannerUrl: true }).extend({
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
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

export const passkeyRegistrationBodySchema = z.object({
  userEmail: z.string(),
  attestationObject: z.string(),
  clientDataJSON: z.string(),
});

export const leaveEntityQuerySchema = z.object({
  idOrSlug: idOrSlugSchema,
  entityType: contextEntityTypeSchema,
});

export const unsubscribeSelfQuerySchema = z.object({
  token: z.string(),
});

export const uploadTokenBodySchema = z.object({
  public: z.boolean(),
  sub: z.string(),
  imado: z.boolean(),
  signature: z.string(),
  params: z
    .object({
      auth: z.object({
        key: z.string(),
        expires: z.string().optional(),
      }),
      // Allow additional arbitrary keys with any type in params
    })
    .catchall(z.any()),
});

export const uploadQuerySchema = z.object({
  public: booleanQuerySchema,
  organizationId: z.string().optional(),
  templateId: z.enum(config.uploadTemplateIds),
});
