import { z } from '@hono/zod-openapi';
import { appConfig, type EnabledOauthProvider } from 'config';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { usersTable } from '#/db/schema/users';
import { membershipSummarySchema } from '#/modules/memberships/schema';
import { paginationQuerySchema, validImageKeySchema, validNameSchema, validSlugSchema } from '#/utils/schema/common';

export const enabledOauthProvidersEnum = z.enum(appConfig.enabledOauthProviders as unknown as [EnabledOauthProvider]);

const userSelectSchema = createSelectSchema(usersTable, {
  email: z.email(),
}).omit({
  hashedPassword: true,
  unsubscribeToken: true,
});

export const userSchema = z.object({ ...userSelectSchema.shape });

export const memberSchema = z.object({
  ...userSchema.shape,
  membership: membershipSummarySchema,
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
