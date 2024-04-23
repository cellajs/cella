import { z } from 'zod';

import { idSchema, imageUrlSchema, nameSchema, passwordSchema, slugSchema } from '../../lib/common-schemas';
import { membershipSchema } from '../organizations/schema';
import { apiUserSchema } from '../users/schema';
import { createSelectSchema } from 'drizzle-zod';
import { tokensTable } from '../../db/schema/tokens';

export const tokensSchema = createSelectSchema(tokensTable);

export const inviteJsonSchema = z.object({
  emails: apiUserSchema.shape.email.array().min(1),
  role: z.union([apiUserSchema.shape.role, membershipSchema.shape.role]).optional(),
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
