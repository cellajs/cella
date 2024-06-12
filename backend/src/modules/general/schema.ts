import { z } from 'zod';

import { config } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { tokensTable } from '../../db/schema/tokens';
import { apiMembershipSchema } from '../memberships/schema';
import { apiUserSchema } from '../users/schema';
import {
  contextEntityTypeSchema,
  idSchema,
  imageUrlSchema,
  nameSchema,
  paginationQuerySchema,
  passwordSchema,
  slugSchema,
} from '../../lib/common-schemas';

export const apiPublicCountsSchema = z.object({
  organizations: z.number(),
  users: z.number(),
});

export const tokensSchema = createSelectSchema(tokensTable);

export const checkTokenSchema = z.object({
  type: tokensSchema.shape.type,
  email: z.string().email(),
  organizationName: z.string().optional(),
  organizationSlug: z.string().optional(),
});

export const inviteJsonSchema = z.object({
  emails: apiUserSchema.shape.email.array().min(1),
  role: z.union([apiUserSchema.shape.role, apiMembershipSchema.shape.role]).optional(),
});

export const acceptInviteJsonSchema = z.object({
  password: passwordSchema.optional(),
  oauth: z.enum(config.oauthProviderOptions).optional(),
});

const suggestionSchema = z.object({
  slug: slugSchema,
  id: idSchema,
  name: nameSchema,
  organizationId: idSchema,
  email: z.string().optional(),
  thumbnailUrl: imageUrlSchema.nullable().optional(),
});

export const entitySuggestionSchema = suggestionSchema.extend({ entity: z.enum(config.entityTypes) });
export type Suggestion = z.infer<typeof entitySuggestionSchema>;

export const suggestionsSchema = z.object({
  entities: z.array(entitySuggestionSchema),
  total: z.number(),
});

export const apiMemberSchema = z.object({
  ...apiUserSchema.shape,
  membershipId: idSchema,
  role: apiMembershipSchema.shape.role,
});

export const getMembersQuerySchema = paginationQuerySchema.extend({
  idOrSlug: idSchema.or(slugSchema),
  entityType: contextEntityTypeSchema,
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt']).default('createdAt').optional(),
  role: z.enum(config.rolesByType.allRoles).default('MEMBER').optional(),
});
