import { membershipBaseSchema } from '#/modules/memberships/schema';
import { contextEntityTypeSchema, idSchema, imageUrlSchema, nameSchema, pageEntityTypeSchema, slugSchema } from '#/utils/schema/common';
import { mapEntitiesToSchema } from '#/utils/schema/entities-to-schema';
import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';

export const contextEntityBaseSchema = z.object({
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
export const userBaseSchema = contextEntityBaseSchema.extend({
  email: z.email(),
  entityType: z.literal('user'),
});

export const entityListItemSchema = contextEntityBaseSchema.extend({
  email: z.string().optional(),
  entityType: pageEntityTypeSchema,
  membership: membershipBaseSchema.nullable(),
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
  contextEntityBaseSchema.extend({
    createdAt: z.string(),
    membership: membershipBaseSchema,
    admins: z.array(userBaseSchema),
  }),
);

export const contextEntitiesQuerySchema = baseEntityQuerySchema.extend({
  role: z.enum(appConfig.rolesByType.entityRoles).optional(),
  type: contextEntityTypeSchema,
  sort: z.enum(['name', 'createdAt']).default('createdAt').optional(),
});
