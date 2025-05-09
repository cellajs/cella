import { config } from 'config';
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

export const entitySuggestionSchema = limitEntitySchema.extend({
  email: z.string().optional(),
  entity: pageEntityTypeSchema,
  membership: membershipInfoSchema.nullable(),
});

export const entitiesSchema = z.object({
  items: z.array(entitySuggestionSchema),
  counts: z.record(z.enum(config.pageEntityTypes), z.number().optional()),
  total: z.number(),
});

export const entitiesQuerySchema = z.object({
  q: z.string().optional(),
  type: pageEntityTypeSchema.optional(),
  targetOrgId: idSchema.optional(),
  targetUserId: idSchema.optional(),
  userMembershipType: contextEntityTypeSchema.optional(),
});
