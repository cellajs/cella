import { z } from '@hono/zod-openapi';
import { appConfig, type EnabledOAuthProvider, type UserFlags } from 'shared';
import { usersTable } from '#/db/schema/users';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import {
  contextEntityTypeSchema,
  languageSchema,
  maxLength,
  paginationQuerySchema,
  validCDNUrlSchema,
  validNameSchema,
  validSlugSchema,
} from '#/schemas';
import { mockUserResponse } from '../../../mocks/mock-user';

export const enabledOAuthProvidersEnum = z.enum(appConfig.enabledOAuthProviders as unknown as [EnabledOAuthProvider]);

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
    // lastSeenAt from last_seen table (populated via subquery in userSelect)
    lastSeenAt: z.string().nullable(),
  })
  .openapi('User', {
    description: 'A user with profile data and last-seen activity timestamp.',
    example: mockUserResponse(),
  });

export const memberSchema = z
  .object({
    ...userSchema.shape,
    membership: membershipBaseSchema,
  })
  .omit({ userFlags: true, newsletter: true });

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

export const userListQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt']).default('createdAt').optional(),
    role: z.enum(appConfig.systemRoles).optional(),
    targetEntityType: contextEntityTypeSchema.optional(),
    targetEntityId: z.string().max(maxLength.id).optional(),
  })
  .refine(
    (data) => (data.targetEntityType && data.targetEntityId) || (!data.targetEntityType && !data.targetEntityId),
    {
      message: 'Both targetEntityType and targetEntityId must be provided together',
    },
  );
