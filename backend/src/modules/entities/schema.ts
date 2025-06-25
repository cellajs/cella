import { membershipSummarySchema } from '#/modules/memberships/schema';
import { contextEntityTypeSchema, idSchema, imageUrlSchema, nameSchema, pageEntityTypeSchema, slugSchema } from '#/utils/schema/common';
import { mapEntitiesToSchema } from '#/utils/schema/entities-to-schema';
import { z } from '@hono/zod-openapi';

export const entityBaseSchema = z.object({
  id: idSchema,
  entityType: contextEntityTypeSchema,
  slug: slugSchema,
  name: nameSchema,
  thumbnailUrl: imageUrlSchema.nullable().optional(),
  bannerUrl: imageUrlSchema.nullable().optional(),
});

const baseEntityQuerySchema = z.object({
  q: z.string().optional(),
  targetUserId: idSchema.optional(),
});

// Declared here to avoid circular dependencies
export const userSummarySchema = entityBaseSchema.extend({
  email: z.email(),
  entityType: z.literal('user'),
});


export const entityListItemSchema = entityBaseSchema.extend({
  email: z.string().optional(),
  entityType: pageEntityTypeSchema,
  membership: membershipSummarySchema.nullable(),
});

export const pageEntitiesSchema = z.object({
  items: z.array(entityListItemSchema),
  counts: mapEntitiesToSchema(() => z.number().optional()),
  total: z.number(),
});

export const pageEntitiesQuerySchema = baseEntityQuerySchema.extend({
  type: pageEntityTypeSchema.optional(),
  targetOrgId: idSchema.optional(),
  userMembershipType: contextEntityTypeSchema.optional(),
});

export const contextEntitiesSchema = z.array(
  entityBaseSchema.extend({
    createdAt: z.string(),
    membership: membershipSummarySchema,
    members: z.array(userSummarySchema)
  })
);

export const contextEntitiesQuerySchema = baseEntityQuerySchema.extend({
  roles: z.preprocess((val) => {
    if (typeof val === 'string') return [val]; // wrap single string as array
    if (Array.isArray(val)) return val;
    return undefined;
  }, z.array(membershipSummarySchema.shape.role).optional()),
  type: contextEntityTypeSchema,
  sort: z.enum(['name', 'createdAt']).default('createdAt').optional(),
});
