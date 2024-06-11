import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { config } from 'config';
import { usersTable } from '../../db/schema/users';
import { imageUrlSchema, nameSchema, paginationQuerySchema, validSlugSchema } from '../../lib/common-schemas';

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
  .setKey(
    'counts',
    z.object({
      memberships: z.number(),
    }),
  );

export const getUsersQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt', 'membershipCount']).default('createdAt').optional(),
    role: z.enum(config.rolesByType.systemRoles).default('USER').optional(),
  }),
);

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
