import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { sessionsTable } from '#/db/schema/sessions';
import { type MenuSectionName, entityRelations } from '#/entity-config';
import { limitEntitySchema } from '#/modules/entities/schema';
import { membershipInfoSchema } from '#/modules/memberships/schema';
import { enabledOauthProvidersEnum } from '#/modules/users/schema';
import { contextEntityTypeSchema, idOrSlugSchema } from '#/utils/schema/common';

const sessionSchema = createSelectSchema(sessionsTable);

export const sessionsSchema = z.object({
  sessions: z.array(sessionSchema.omit({ token: true }).extend({ createdAt: z.string(), expiresAt: z.string(), isCurrent: z.boolean() })),
});

export const meAuthInfoSchema = z.object({
  oauth: z.array(enabledOauthProvidersEnum),
  passkey: z.boolean(),
  ...sessionsSchema.shape,
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
