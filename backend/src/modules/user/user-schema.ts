import { z } from '@hono/zod-openapi';
import { appConfig, type EnabledOAuthProvider, type UserFlags } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { memberCountsSchema } from '#/modules/memberships/helpers/member-counts';
import { memberMembershipSchema } from '#/modules/memberships/memberships-schema';
import { usersTable } from '#/modules/user/user-db';
import { languageSchema, maxLength, paginationQuerySchema, validCDNUrlSchema, validNameSchema, validSlugSchema } from '#/schemas';
import { userBaseSchema } from '#/schemas/user-schema-base';
import { mockUserResponse } from './user-mocks';

export const enabledOAuthProvidersSchema = z.enum([...appConfig.enabledOAuthProviders] as [EnabledOAuthProvider, ...EnabledOAuthProvider[]]);

export const userFlagsSchema = z.object(
  Object.keys(appConfig.defaultUserFlags).reduce(
    (acc, key) => {
      acc[key as keyof UserFlags] = z.boolean();
      return acc;
    },
    {} as { [K in keyof UserFlags]: z.ZodBoolean },
  ),
);

export const userSchema = createSelectSchema(usersTable, { email: z.email(), language: languageSchema, userFlags: userFlagsSchema })
  .extend({
    // Activity times from the user's actors row (userSelect)
    lastSeenAt: z.string().nullable(),
    lastSignInAt: z.string().nullable(),
  })
  .openapi('User', {
    description:
      'A full user account: profile, preferences such as language and newsletter, the MFA setting and activity timestamps. Returned to the user themselves and to system admins; other users see the `UserBase` fields.',
    example: mockUserResponse(),
    'x-tags': schemaTags('data', 'users', 'cella'),
  });

/** Public user schema for cross-tenant and member-facing endpoints. Based on userBaseSchema + lastSeenAt. */
export const memberUserSchema = userBaseSchema.extend({ lastSeenAt: z.string().nullable() });

export const memberSchema = memberUserSchema.extend({
  membership: memberMembershipSchema,
  // Per-member insight counts, present when the members list is fetched with include=counts
  counts: memberCountsSchema.optional(),
});

export const userUpdateBodySchema = createInsertSchema(usersTable, {
  firstName: validNameSchema.nullable(),
  lastName: validNameSchema.nullable(),
  slug: validSlugSchema,
  thumbnailUrl: validCDNUrlSchema.nullable(),
  bannerUrl: validCDNUrlSchema.nullable(),
  language: languageSchema,
  description: z.string().max(maxLength.html).nullable(),
})
  .pick({
    bannerUrl: true,
    contrast: true,
    description: true,
    firstName: true,
    lastName: true,
    language: true,
    newsletter: true,
    thumbnailUrl: true,
    slug: true,
  })
  .partial();

export const userListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt']).default('createdAt'),
  role: z.enum(appConfig.systemRoles).optional(),
});
