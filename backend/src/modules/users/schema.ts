import { z } from '@hono/zod-openapi';
import { appConfig, type EnabledOAuthProvider } from 'config';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { usersTable } from '#/db/schema/users';
import { membershipBaseSchema } from '#/modules/memberships/schema';
import { paginationQuerySchema, validImageKeySchema, validNameSchema, validSlugSchema } from '#/utils/schema/common';

export const enabledOAuthProvidersEnum = z.enum(appConfig.enabledOAuthProviders as unknown as [EnabledOAuthProvider]);

const userSelectSchema = createSelectSchema(usersTable, {
  email: z.email(),
}).omit({
  hashedPassword: true,
  unsubscribeToken: true,
});

export const userSchema = z.object({ ...userSelectSchema.shape });

export const memberSchema = z.object({
  ...userSchema.shape,
  membership: membershipBaseSchema,
});

export const userUpdateBodySchema = createInsertSchema(usersTable, {
  firstName: validNameSchema.nullable(),
  lastName: validNameSchema.nullable(),
  slug: validSlugSchema,
  thumbnailUrl: validImageKeySchema.nullable(),
  bannerUrl: validImageKeySchema.nullable(),
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

export const userListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt', 'membershipCount']).default('createdAt').optional(),
  role: z.enum(appConfig.rolesByType.systemRoles).optional(),
});
