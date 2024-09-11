import { z } from 'zod';

import { tokensTable } from '#/db/schema/tokens';
import {
  contextEntityTypeSchema,
  idOrSlugSchema,
  idSchema,
  imageUrlSchema,
  nameSchema,
  pageEntityTypeSchema,
  paginationQuerySchema,
  passwordSchema,
  slugSchema,
} from '#/lib/common-schemas';
import { createEntitiesSchema } from '#/lib/schema-utils';
import { config } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { membershipInfoSchema } from '../memberships/schema';
import { userSchema } from '../users/schema';

export const publicCountsSchema = createEntitiesSchema(() => z.number());

export const checkTokenSchema = z.object({
  type: createSelectSchema(tokensTable).shape.type,
  email: z.string().email(),
  organizationName: z.string().optional(),
  organizationSlug: z.string().optional(),
});

export const inviteBodySchema = z.object({
  emails: userSchema.shape.email.array().min(1),
  role: userSchema.shape.role,
});

export const acceptInviteBodySchema = z.object({
  password: passwordSchema.optional(),
  oauth: z.enum(config.oauthProviderOptions).optional(),
});

export const entitySuggestionSchema = z.object({
  slug: slugSchema,
  id: idSchema,
  name: nameSchema,
  organizationId: idSchema.optional(),
  email: z.string().optional(),
  thumbnailUrl: imageUrlSchema.nullable().optional(),
  entity: pageEntityTypeSchema,
  parentId: z.string().nullable().optional(),
});

export type Suggestion = z.infer<typeof entitySuggestionSchema>;

export const suggestionsSchema = z.object({
  items: z.array(entitySuggestionSchema),
  total: z.number(),
});

export const membersSchema = z.object({
  ...userSchema.shape,
  membership: membershipInfoSchema,
});

export const membersQuerySchema = paginationQuerySchema.extend({
  idOrSlug: idOrSlugSchema,
  entityType: contextEntityTypeSchema,
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt']).default('createdAt').optional(),
  role: z.enum(config.rolesByType.entityRoles).default('member').optional(),
});
