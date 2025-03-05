import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { sessionsTable } from '#/db/schema/sessions';
import { type MenuSectionName, entityRelations } from '#/entity-config';
import { contextEntityTypeSchema, idOrSlugSchema } from '#/utils/schema/common';
import { limitEntitySchema } from '../general/schema';
import { membershipInfoSchema } from '../memberships/schema';
import { signUpInfo } from '../users/schema';

const sessionSchema = createSelectSchema(sessionsTable);

export const sessionsSchema = z.object({
  sessions: z.array(sessionSchema.omit({ token: true }).extend({ createdAt: z.string(), expiresAt: z.string(), isCurrent: z.boolean() })),
});

export const meAuthInfoSchema = z.object({
  ...signUpInfo.shape,
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
