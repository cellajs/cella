import { z } from '@hono/zod-openapi';
import { appConfig, recordFromKeys, typedEntries } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { memberCountsSchema } from '#/modules/memberships/helpers/member-counts';
import { memberMembershipSchema } from '#/modules/memberships/memberships-schema';
import { usersTable } from '#/modules/user/user-db';
import { mockUserResponse } from '#/modules/user/user-mocks';
import { languageSchema, listQuerySchema, maxLength, orderByQuerySchema, validCDNUrlSchema, validNameSchema, validSlugSchema } from '#/schemas';
import { userBaseSchema } from '#/schemas/user-schema-base';

export const enabledOAuthProvidersSchema = z.enum(appConfig.enabledOAuthProviders);

export const userFlagsSchema = z.object(
  recordFromKeys(
    typedEntries(appConfig.defaultUserFlags).map(([key]) => key),
    () => z.boolean(),
  ),
);

export const userSchema = createSelectSchema(usersTable, { email: z.email(), languageCode: languageSchema, userFlags: userFlagsSchema })
  // A profile, not an audited row: who last changed it stays in the database.
  .omit({ updatedBy: true })
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

/** A user as other users see them, for cross-tenant and member-facing endpoints. */
export const memberUserSchema = userBaseSchema.extend({ lastSeenAt: z.string().nullable() });

export const memberSchema = memberUserSchema.extend({
  membership: memberMembershipSchema,
  /** Per-member insight counts, present when the members list is fetched with include=counts. */
  counts: memberCountsSchema.optional(),
  /**
   * With include=mfa, for the organization's admins. Absent for other callers: the field would list the accounts
   * without a second factor.
   */
  mfaRequired: z.boolean().optional(),
});

export const userUpdateBodySchema = createInsertSchema(usersTable, {
  givenName: validNameSchema.nullable(),
  familyName: validNameSchema.nullable(),
  slug: validSlugSchema,
  thumbnailUrl: validCDNUrlSchema.nullable(),
  bannerUrl: validCDNUrlSchema.nullable(),
  languageCode: languageSchema,
  contrast: z.enum(usersTable.contrast.enumValues),
  description: z.string().max(maxLength.html).nullable(),
})
  .pick({
    bannerUrl: true,
    contrast: true,
    description: true,
    givenName: true,
    familyName: true,
    languageCode: true,
    newsletter: true,
    thumbnailUrl: true,
    slug: true,
  })
  .partial();

export const userListQuerySchema = listQuerySchema.extend({
  orderBy: orderByQuerySchema(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt'], 'createdAt desc'),
  role: z.enum(appConfig.systemRoles).optional(),
});
