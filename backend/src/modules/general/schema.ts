import { z } from 'zod';

import { config } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { requestsTable } from '../../db/schema/requests';
import { tokensTable } from '../../db/schema/tokens';
import {
  entityTypeSchema,
  idSchema,
  imageUrlSchema,
  nameSchema,
  paginationQuerySchema,
  passwordSchema,
  slugSchema,
  validSlugSchema,
} from '../../lib/common-schemas';
import { apiMembershipSchema } from '../memberships/schema';
import { apiUserSchema } from '../users/schema';

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

export const inviteQuerySchema = z.object({
  idOrSlug: idSchema.or(validSlugSchema).optional(),
});

export const acceptInviteJsonSchema = z.object({
  password: passwordSchema.optional(),
  oauth: z.enum(config.oauthProviderOptions).optional(),
});

const suggestionSchema = z.object({
  slug: slugSchema,
  id: idSchema,
  name: nameSchema,
  email: z.string().optional(),
  thumbnailUrl: imageUrlSchema.nullable().optional(),
});

export const entitySuggestionSchema = suggestionSchema.extend({ type: z.enum(config.entityTypes) });

export const suggestionsSchema = z.object({
  entities: z.array(entitySuggestionSchema),
  total: z.number(),
});

export const actionReqTableSchema = createSelectSchema(requestsTable);

export const createRequestSchema = z.object({
  email: z.string().min(1).email(),
  type: actionReqTableSchema.shape.type,
  message: z.string().nullable(),
});

export const actionResponseSchema = z.object({
  email: z.string().min(1).email(),
  type: actionReqTableSchema.shape.type,
});

export const apiRequestSchema = z.object({
  ...createSelectSchema(requestsTable).shape,
  createdAt: z.string(),
});

export const getRequestsQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'email', 'type', 'createdAt']).default('createdAt').optional(),
  }),
);

export const getMembersParamSchema = z.object({
  idOrSlug: idSchema.or(slugSchema),
  entityType: entityTypeSchema,
});

export const getMembersQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt']).default('createdAt').optional(),
  role: z.enum(config.allRoles).default('MEMBER').optional(),
});
