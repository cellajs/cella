import { z } from '@hono/zod-openapi';
import { appConfig, type EnabledOAuthProvider, type UserFlags } from 'config';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { usersTable } from '#/db/schema/users';
import { membershipBaseSchema } from '#/modules/memberships/schema';
import { contextEntityTypeSchema, paginationQuerySchema, validImageKeySchema, validNameSchema, validSlugSchema } from '#/utils/schema/common';

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
  userFlags: userFlagsSchema,
})
  .omit({
    unsubscribeToken: true,
  })
  .openapi('User');

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

export const userListQuerySchema = paginationQuerySchema
  .extend({
    sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt']).default('createdAt').optional(),
    role: z.enum(appConfig.rolesByType.systemRoles).optional(),
    mode: z.enum(['all', 'shared']).default('shared'),
    targetEntityType: contextEntityTypeSchema.optional(),
    targetEntityId: z.string().optional(),
  })
  .refine((data) => (data.targetEntityType && data.targetEntityId) || (!data.targetEntityType && !data.targetEntityId), {
    message: 'Both targetEntityType and targetEntityId must be provided together',
  });
