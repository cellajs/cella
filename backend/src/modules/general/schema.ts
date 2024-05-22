import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { tokensTable } from '../../db/schema/tokens';
import { idSchema, imageUrlSchema, nameSchema, paginationQuerySchema, passwordSchema, slugSchema, validSlugSchema } from '../../lib/common-schemas';
import { apiMembershipSchema } from '../memberships/schema';
import { apiUserSchema } from '../users/schema';
import { requestsTable } from '../../db/schema/requests';

export const tokensSchema = createSelectSchema(tokensTable);

export const inviteJsonSchema = z.object({
  emails: apiUserSchema.shape.email.array().min(1),
  role: z.union([apiUserSchema.shape.role, apiMembershipSchema.shape.role]).optional(),
});

export const inviteQuerySchema = z.object({
  idOrSlug: idSchema.or(validSlugSchema).optional(),
});

export const acceptInviteJsonSchema = z.object({
  password: passwordSchema.optional(),
  oauth: z.enum(['google', 'microsoft', 'github']).optional(),
});

export const apiPublicCountsSchema = z.object({
  organizations: z.number(),
  users: z.number(),
});

const suggestionSchema = z.object({
  slug: slugSchema,
  id: idSchema,
  name: nameSchema,
  thumbnailUrl: imageUrlSchema.nullable(),
});

export const userSuggestionSchema = suggestionSchema.extend({ email: z.string(), type: z.literal('USER') });
export const organizationSuggestionSchema = suggestionSchema.extend({ type: z.literal('ORGANIZATION') });
export const workspaceSuggestionSchema = suggestionSchema.extend({ type: z.literal('WORKSPACE') });

export const suggestionsSchema = z.object({
  users: z.array(userSuggestionSchema),
  organizations: z.array(organizationSuggestionSchema),
  workspaces: z.array(workspaceSuggestionSchema),
  total: z.number(),
});

export const actionReqTableSchema = createSelectSchema(requestsTable);

export const actionRequestSchema = z.object({
  userId: idSchema.nullable(),
  organizationId: idSchema.nullable(),
  email: z.string().min(1).email(),
  type: actionReqTableSchema.shape.type,
  accompanyingMessage: z.string().nullable(),
});

export const actionResponseSchema = z.object({
  userId: idSchema.nullable(),
  organizationId: idSchema.nullable(),
  email: z.string().min(1).email(),
  type: actionReqTableSchema.shape.type,
});

export const getRequestsSchema = z.object({
  requestsInfo: z.array(
    z.object({
      id: idSchema,
      email: z.string(),
      createdAt: z.string(),
      type: actionReqTableSchema.shape.type,
      message: z.string().nullable(),
      userId: z.string().nullable(),
      userName: z.string().nullable(),
      userThumbnail: z.string().nullable(),
      organizationId: z.string().nullable(),
      organizationName: z.string().nullable(),
      organizationThumbnail: z.string().nullable(),
    }),
  ),
  total: z.number(),
});

export const getRequestsQuerySchema = paginationQuerySchema.merge(
  z.object({
    mode: z.enum(['system', 'organization']),
    sort: z.enum(['id', 'email', 'type', 'createdAt']).default('createdAt').optional(),
  }),
);
