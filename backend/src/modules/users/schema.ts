import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { config } from 'config';
import { usersTable } from '#/db/schema/users';
import { imageUrlSchema, nameSchema, paginationQuerySchema, validSlugSchema } from '#/utils/schema/common-schemas';

export const signUpInfo = z.object({ oauth: z.array(z.enum(config.enabledOauthProviders)), passkey: z.boolean() });

export const baseUserSchema = createSelectSchema(usersTable, {
  email: z.string().email(),
  lastSeenAt: z.string().nullable(),
  lastStartedAt: z.string().nullable(),
  lastSignInAt: z.string().nullable(),
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
}).omit({
  hashedPassword: true,
  unsubscribeToken: true,
});

export const userSchema = z.object({
  ...baseUserSchema.shape,
  counts: z.object({ memberships: z.number() }),
});

export const updatedUserSchema = z.object({
  ...userSchema.shape,
  ...signUpInfo.shape,
});

export const limitedUserSchema = createSelectSchema(usersTable, {
  email: z.string().email(),
}).pick({
  id: true,
  name: true,
  email: true,
  entity: true,
  thumbnailUrl: true,
  bannerUrl: true,
});

export const usersQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt', 'membershipCount']).default('createdAt').optional(),
    role: z.enum(config.rolesByType.systemRoles).default('user').optional(),
  }),
);
export const userUnsubscribeQuerySchema = z.object({
  token: z.string(),
});

export const updateUserBodySchema = createInsertSchema(usersTable, {
  email: z.string().email(),
  firstName: nameSchema.nullable(),
  lastName: nameSchema.nullable(),
  slug: validSlugSchema,
  thumbnailUrl: imageUrlSchema.nullable(),
  bannerUrl: imageUrlSchema.nullable(),
})
  .pick({
    email: true,
    bannerUrl: true,
    firstName: true,
    lastName: true,
    language: true,
    newsletter: true,
    thumbnailUrl: true,
    slug: true,
    role: true,
  })
  .partial();
