import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { config } from 'config';
import { usersTable } from '#/db/schema/users';
import { paginationQuerySchema, validImageUrlSchema, validNameSchema, validSlugSchema } from '#/utils/schema/common';

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
  firstName: validNameSchema.nullable(),
  lastName: validNameSchema.nullable(),
  slug: validSlugSchema,
  thumbnailUrl: validImageUrlSchema.nullable(),
  bannerUrl: validImageUrlSchema.nullable(),
})
  .pick({
    bannerUrl: true,
    firstName: true,
    lastName: true,
    language: true,
    newsletter: true,
    thumbnailUrl: true,
    slug: true,
  })
  .partial();
