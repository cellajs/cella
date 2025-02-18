import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { type EnabledOauthProvider, config } from 'config';
import { usersTable } from '#/db/schema/users';
import { paginationQuerySchema, validImageUrlSchema, validNameSchema, validSlugSchema } from '#/utils/schema/common';

const enabledOauthProvidersEnum = z.enum(config.enabledOauthProviders as unknown as [EnabledOauthProvider]);
export const signUpInfo = z.object({ oauth: z.array(enabledOauthProvidersEnum), passkey: z.boolean() });

const userTableSchema = createSelectSchema(usersTable, {
  email: z.string().email(),
}).omit({
  hashedPassword: true,
  unsubscribeToken: true,
});

export const userSchema = z.object({ ...userTableSchema.shape });

export const limitedUserSchema = userTableSchema.pick({
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
