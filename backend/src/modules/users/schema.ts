import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { usersTable } from '../../db/schema/users';
import { idSchema, imageUrlSchema, nameSchema, paginationQuerySchema, slugSchema, validSlugSchema } from '../../lib/common-schemas';

export const apiUserSchema = createSelectSchema(usersTable, {
  email: z.string().email(),
  clearSessionsAt: z.string().nullable(),
  lastEmailAt: z.string().nullable(),
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

export type ApiUser = z.infer<typeof apiUserSchema>;

export const updateUserParamSchema = z.object({
  userId: idSchema,
});

export const getUserParamSchema = z.object({
  userId: idSchema.or(slugSchema),
});

export const getUsersQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'membershipCount']).default('createdAt').optional(),
    role: z.enum(['admin', 'user']).default('user').optional(),
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
  })
  .partial();
