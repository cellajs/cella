import { z } from 'zod';

import { config } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { tokensTable } from '../../db/schema/tokens';
import {
  contextEntityTypeSchema,
  idOrSlugSchema,
  idSchema,
  imageUrlSchema,
  nameSchema,
  paginationQuerySchema,
  passwordSchema,
  slugSchema,
} from '../../lib/common-schemas';
import { membershipInfoSchema } from '../memberships/schema';
import { userSchema } from '../users/schema';
import { t } from '../../lib/utils';

export const publicCountsSchema = z.object({
  users: z.number(),
  organizations: z.number(),
  workspaces: z.number(),
  projects: z.number(),
  tasks: z.number(),
  labels: z.number(),
});

export const checkTokenSchema = z.object({
  type: createSelectSchema(tokensTable).shape.type,
  email: z.string().email(),
  organizationName: z.string().optional(),
  organizationSlug: z.string().optional(),
});

export const inviteBodySchema = z.object({
  emails: userSchema.shape.email.array().min(1, { message: t('invalid.min_items', { items_count: 'one', item: 'email' }) }),
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
  organizationId: idSchema,
  email: z.string().optional(),
  thumbnailUrl: imageUrlSchema.nullable().optional(),
  entity: z.enum(config.entityTypes),
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
  role: z.enum(config.rolesByType.entityRoles).default('MEMBER').optional(),
});
