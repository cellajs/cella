import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { type EnabledOauthProvider, config } from 'config';
import { usersTable } from '#/db/schema/users';
import { paginationQuerySchema, validImageKeySchema, validNameSchema, validSlugSchema } from '#/utils/schema/common';
import { entityBaseSchema } from '../entities/schema';
import { membershipSummarySchema } from '../memberships/schema';

export const enabledOauthProvidersEnum = z.enum(config.enabledOauthProviders as unknown as [EnabledOauthProvider]);

const userSelectSchema = createSelectSchema(usersTable, {
  email: z.string().email(),
}).omit({
  hashedPassword: true,
  unsubscribeToken: true,
});

export const userSchema = z.object({ ...userSelectSchema.shape });

export const userBaseSchema = entityBaseSchema.extend({
  email: z.string().email(),
  entity: z.literal('user'),
});

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

export const userListQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt', 'membershipCount']).default('createdAt').optional(),
    role: z.enum(config.rolesByType.systemRoles).default('user').optional(),
  }),
);
