import { z } from 'zod';

import { idSchema, imageUrlSchema, nameSchema, slugSchema } from '../../lib/common-schemas';
import { membershipSchema } from '../organizations/schema';
import { apiUserSchema } from '../users/schema';

export const inviteJsonSchema = z.object({
  idOrSlug: idSchema.or(slugSchema).optional(),
  emails: apiUserSchema.shape.email.array().min(1),
  role: z.union([apiUserSchema.shape.role, membershipSchema.shape.role]).optional(),
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

export const userSuggestionSchema = suggestionSchema.extend({ email: z.string(), type: z.literal('user') });
export const organizationSuggestionSchema = suggestionSchema.extend({ type: z.literal('organization') });
export const workspaceSuggestionSchema = suggestionSchema.extend({ type: z.literal('workspace') });

export const suggestionsSchema = z.object({
  users: z.array(userSuggestionSchema),
  organizations: z.array(organizationSuggestionSchema),
  workspaces: z.array(workspaceSuggestionSchema),
  total: z.number(),
});
