import { z } from '@hono/zod-openapi';
import { appConfig, type ContextEntityType } from 'config';
import { membershipBaseSchema } from '#/modules/memberships/schema';
import { membershipCountSchema } from '#/modules/organizations/schema';
import { contextEntityTypeSchema, idSchema, imageUrlSchema, nameSchema, paginationQuerySchema, slugSchema } from '#/utils/schema/common';

export const contextEntityBaseSchema = z
  .object({
    id: idSchema,
    entityType: contextEntityTypeSchema,
    slug: slugSchema,
    name: nameSchema,
    thumbnailUrl: imageUrlSchema.nullable().optional(),
    bannerUrl: imageUrlSchema.nullable().optional(),
  })
  .openapi('ContextEntityBaseSchema');

// Extend base entity schema with membership base data
export const contextEntityWithMembershipSchema = contextEntityBaseSchema.extend({ membership: membershipBaseSchema });

// Declared here to avoid circular dependencies
export const userBaseSchema = contextEntityBaseSchema
  .omit({ entityType: true })
  .extend({
    email: z.email(),
    entityType: z.literal('user'),
  })
  .openapi('UserBaseSchema');

export const contextEntitiesQuerySchema = paginationQuerySchema.extend({
  targetUserId: idSchema.optional(),
  targetOrgId: idSchema.optional(),
  role: z.enum(appConfig.rolesByType.entityRoles).optional(),
  sort: z.enum(['name', 'createdAt']).default('createdAt').optional(),
  excludeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  types: z
    .union([contextEntityTypeSchema, z.array(contextEntityTypeSchema)])
    .optional()
    .transform((val) => (val === undefined ? undefined : Array.isArray(val) ? val : [val])),
  orgAffiliated: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
});

const fullContextEntitySchema = contextEntityBaseSchema.extend({
  createdAt: z.string(),
  membership: membershipBaseSchema.nullable(),
  membershipCounts: membershipCountSchema,
});

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
