import { config } from 'config';
import { z } from 'zod';
import { contextEntityTypeSchema, idSchema, imageUrlSchema, nameSchema, pageEntityTypeSchema, slugSchema } from '#/utils/schema/common';
import { membershipSummarySchema } from '../memberships/schema';

export const entityBaseSchema = z.object({
  id: idSchema,
  entity: contextEntityTypeSchema,
  slug: slugSchema,
  name: nameSchema,
  thumbnailUrl: imageUrlSchema.nullable().optional(),
  bannerUrl: imageUrlSchema.nullable().optional(),
});

export const entityListItemSchema = entityBaseSchema.extend({
  email: z.string().optional(),
  entity: pageEntityTypeSchema,
  membership: membershipSummarySchema.nullable(),
});

export const entityListSchema = z.object({
  items: z.array(entityListItemSchema),
  counts: z.record(z.enum(config.pageEntities), z.number().optional()),
  total: z.number(),
});

export const entityListQuerySchema = z.object({
  q: z.string().optional(),
  type: pageEntityTypeSchema.optional(),
  targetOrgId: idSchema.optional(),
  targetUserId: idSchema.optional(),
  userMembershipType: contextEntityTypeSchema.optional(),
});
