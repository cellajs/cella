import { z } from 'zod';
import { contextEntityTypeSchema, idSchema, imageUrlSchema, nameSchema, pageEntityTypeSchema, slugSchema } from '#/utils/schema/common';
import { membershipInfoSchema } from '../memberships/schema';
import { userSchema } from '../users/schema';

export const inviteBodySchema = z.object({
  emails: userSchema.shape.email.array().min(1).max(50),
});

export const limitEntitySchema = z.object({
  id: idSchema,
  entity: contextEntityTypeSchema,
  slug: slugSchema,
  name: nameSchema,
  thumbnailUrl: imageUrlSchema.nullable().optional(),
  bannerUrl: imageUrlSchema.nullable().optional(),
});

export const entitySuggestionSchema = limitEntitySchema
  .omit({ bannerUrl: true })
  .extend({ email: z.string().optional(), entity: pageEntityTypeSchema, membership: membershipInfoSchema });

export const suggestionsSchema = z.object({
  items: z.array(entitySuggestionSchema),
  total: z.number(),
});
