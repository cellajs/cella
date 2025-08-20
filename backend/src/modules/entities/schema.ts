import { z } from '@hono/zod-openapi';
import { appConfig, type ContextEntityType } from 'config';
import { membershipBaseSchema } from '#/modules/memberships/schema';
import { contextEntityTypeSchema, idSchema, imageUrlSchema, nameSchema, pageEntityTypeSchema, slugSchema } from '#/utils/schema/common';
import { mapEntitiesToSchema } from '#/utils/schema/entities-to-schema';

const contextEntityBaseSchema = z.object({
  id: idSchema,
  entityType: contextEntityTypeSchema,
  slug: slugSchema,
  name: nameSchema,
  thumbnailUrl: imageUrlSchema.nullable().optional(),
  bannerUrl: imageUrlSchema.nullable().optional(),
});

// Extend base schema
export const contextEntityWithMembershipSchema = contextEntityBaseSchema.extend({
  membership: membershipBaseSchema.nullable(),
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

export const pageEntitiesQuerySchema = z.object({
  q: z.string().optional(),
  targetUserId: idSchema.optional(),
  type: pageEntityTypeSchema.optional(),
  targetOrgId: idSchema.optional(),
  userMembershipType: contextEntityTypeSchema.optional(),
});

export const contextEntitiesQuerySchema = z.object({
  q: z.string().optional(),
  targetUserId: idSchema.optional(),
  role: z.enum(appConfig.rolesByType.entityRoles).optional(),
  sort: z.enum(['name', 'createdAt']).default('createdAt').optional(),
  types: z
    .union([contextEntityTypeSchema, z.array(contextEntityTypeSchema)])
    .optional()
    .transform((val) => (val === undefined ? [] : Array.isArray(val) ? val : [val])),
});

const fullContextEntitySchema = contextEntityWithMembershipSchema.extend({ createdAt: z.string() });

const contextEntitiesDataSchema = z.object(
  appConfig.contextEntityTypes.reduce(
    (acc, entityType) => {
      acc[entityType] = z.array(fullContextEntitySchema);
      return acc;
    },
    {} as Record<ContextEntityType, z.ZodArray<typeof fullContextEntitySchema>>,
  ),
);

export const contextEntitiesResponseSchema = z.object({ items: contextEntitiesDataSchema, total: z.number() });
