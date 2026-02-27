import { z } from '@hono/zod-openapi';
import { appConfig, type EnabledOAuthProvider, type UserFlags } from 'shared';
import { usersTable } from '#/db/schema/users';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { languageSchema, paginationQuerySchema, validCDNUrlSchema, validNameSchema, validSlugSchema } from '#/schemas';
import { userBaseSchema } from '#/schemas/user-schema-base';
import { mockUserResponse } from '../../../mocks/mock-user';

export const enabledOAuthProvidersEnum = z.enum(
  appConfig.enabledOAuthProviders as [EnabledOAuthProvider, ...EnabledOAuthProvider[]],
);

export const userFlagsSchema = z.object(
  Object.keys(appConfig.defaultUserFlags).reduce(
    (acc, key) => {
      acc[key as keyof UserFlags] = z.boolean();
      return acc;
    },
    {} as { [K in keyof UserFlags]: z.ZodBoolean },
  ),
);

export const userSchema = createSelectSchema(usersTable, {
  email: z.email(),
  language: languageSchema,
  userFlags: userFlagsSchema,
})
  .extend({
    // Activity timestamps from user_activity table (populated via subqueries in userSelect)
    lastSeenAt: z.string().nullable(),
    lastStartedAt: z.string().nullable(),
    lastSignInAt: z.string().nullable(),
  })
  .openapi('User', {
    description: 'A user with profile data and activity timestamps.',
    example: mockUserResponse(),
  });

/** Public user schema for cross-tenant and member-facing endpoints. Based on userBaseSchema + lastSeenAt. */
export const memberUserSchema = userBaseSchema.extend({
  lastSeenAt: z.string().nullable(),
});

export const memberSchema = memberUserSchema.extend({
  membership: membershipBaseSchema,
});

export const userUpdateBodySchema = createInsertSchema(usersTable, {
  firstName: validNameSchema.nullable(),
  lastName: validNameSchema.nullable(),
  slug: validSlugSchema,
  thumbnailUrl: validCDNUrlSchema.nullable(),
  bannerUrl: validCDNUrlSchema.nullable(),
  language: languageSchema,
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
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt']).default('createdAt').optional(),
  role: z.enum(appConfig.systemRoles).optional(),
});
