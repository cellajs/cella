import { membershipSummarySchema } from '#/modules/memberships/schema';
import { userSummarySchema } from '#/modules/users/schema';
import { contextEntityTypeSchema, idSchema, imageUrlSchema, nameSchema, pageEntityTypeSchema, slugSchema } from '#/utils/schema/common';
import { config } from 'config';
import { z } from 'zod';

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

export const entityListItemSchema = entityBaseSchema.extend({
  email: z.string().optional(),
  entityType: pageEntityTypeSchema,
  membership: membershipSummarySchema.nullable(),
});

export const pageEntitiesSchema = z.object({
  items: z.array(entityListItemSchema),
  counts: z.record(z.enum(config.pageEntityTypes), z.number().optional()),
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
    members: z.array(z.lazy(() => userSummarySchema)),
  }),
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
