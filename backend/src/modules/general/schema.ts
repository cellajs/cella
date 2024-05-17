import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { tokensTable } from '../../db/schema/tokens';
import { idSchema, imageUrlSchema, nameSchema, passwordSchema, slugSchema, validSlugSchema } from '../../lib/common-schemas';
import { apiMembershipSchema } from '../memberships/schema';
import { accessRequestsTable } from '../../db/schema/access-requests';
import { apiUserSchema } from '../users/schema';

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

export const accessReqSchema = createSelectSchema(accessRequestsTable);

export const accessRequestSchema = z.object({
  userId: idSchema.nullable(),
  organizationId: idSchema.nullable(),
  email: z.string().min(1).email(),
  type: accessReqSchema.shape.type,
});
