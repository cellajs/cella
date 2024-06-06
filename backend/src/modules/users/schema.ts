import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { config } from 'config';
import { usersTable } from '../../db/schema/users';
import { entityTypeSchema, idSchema, imageUrlSchema, nameSchema, paginationQuerySchema, slugSchema, validSlugSchema } from '../../lib/common-schemas';
import { apiMembershipSchema } from '../memberships/schema';

export const apiUserSchema = createSelectSchema(usersTable, {
  email: z.string().email(),
  lastSeenAt: z.string().nullable(),
  lastVisitAt: z.string().nullable(),
  lastSignInAt: z.string().nullable(),
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
})
  .omit({
    hashedPassword: true,
  })
  .setKey('electricJWTToken', z.string().nullable())
  .setKey(
    'counts',
    z.object({
      memberships: z.number(),
    }),
  )
  .setKey('sessions', z.array(z.object({ id: z.string(), type: z.enum(['MOBILE', 'DESKTOP']), current: z.boolean(), expiresAt: z.string() })));

export const getUsersQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt', 'membershipCount']).default('createdAt').optional(),
    role: z.enum(config.systemRoles).default('USER').optional(),
  }),
);

const menuItemSchema = z.object({
  slug: slugSchema,
  id: idSchema,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  name: nameSchema,
  thumbnailUrl: imageUrlSchema.nullish(),
  archived: z.boolean(),
  muted: z.boolean(),
  role: apiMembershipSchema.shape.role.nullable(),
  membershipId: idSchema,
  workspaceId: idSchema.optional(),
});

const menuSchema = z.array(
  z.object({
    ...menuItemSchema.shape,
    submenu: z.object({ items: z.array(menuItemSchema), canCreate: z.boolean(), type: entityTypeSchema }).optional(),
  }),
);

const menuSectionSchema = z.object({ items: menuSchema, canCreate: z.boolean(), type: entityTypeSchema });

export const userMenuSchema = z.object({
  organizations: menuSectionSchema,
  workspaces: menuSectionSchema,
});

export const updateUserJsonSchema = createInsertSchema(usersTable, {
  email: z.string().email(),
  firstName: nameSchema,
  lastName: nameSchema,
  slug: validSlugSchema,
  thumbnailUrl: imageUrlSchema,
  bannerUrl: imageUrlSchema,
})
  .pick({
    email: true,
    bannerUrl: true,
    bio: true,
    firstName: true,
    lastName: true,
    language: true,
    newsletter: true,
    thumbnailUrl: true,
    slug: true,
    role: true,
  })
  .partial();
