import { z } from 'zod';
import { contextEntityTypeSchema, idSchema, imageUrlSchema, nameSchema, pageEntityTypeSchema, slugSchema } from '#/utils/schema/common';
import { membershipInfoSchema } from '../memberships/schema';

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

export const entitiesSchema = z.object({
  items: z.array(entitySuggestionSchema),
  total: z.number(),
});

export const entitiesQuerySchema = z.object({
  q: z.string().optional(),
  type: pageEntityTypeSchema.optional(),
  entityId: idSchema.optional(),
});
