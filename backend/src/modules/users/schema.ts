import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { config } from 'config';
import { usersTable } from '#/db/schema/users';
import { imageUrlSchema, nameSchema, paginationQuerySchema, validSlugSchema } from '#/utils/schema/common-schemas';

export const userSchema = createSelectSchema(usersTable, {
  email: z.string().email(),
  lastSeenAt: z.string().nullable(),
  lastVisitAt: z.string().nullable(),
  lastSignInAt: z.string().nullable(),
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
})
  .omit({
    hashedPassword: true,
    unsubscribeToken: true,
  })
  .setKey(
    'counts',
    z.object({
      memberships: z.number(),
    }),
  );

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
