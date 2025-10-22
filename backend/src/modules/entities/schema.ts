import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { membershipBaseSchema } from '#/modules/memberships/schema';
import { membershipCountSchema } from '#/modules/organizations/schema';
import { contextEntityTypeSchema, idSchema, paginationQuerySchema } from '#/utils/schema/common';
import { contextEntityBaseSchema } from './schema-base';

// Extend base entity schema with membership base data
export const contextEntityWithMembershipSchema = contextEntityBaseSchema.extend({
  membership: membershipBaseSchema,
  createdAt: z.string(),
});

export const contextEntityWithCountsSchema = contextEntityBaseSchema.extend({
  membership: z.object({ ...membershipBaseSchema.shape }).nullable(),
  createdAt: z.string(),
  membershipCounts: membershipCountSchema,
});

export const contextEntitiesQuerySchema = paginationQuerySchema.extend({
  targetUserId: idSchema.optional(),
  targetOrgId: idSchema.optional(),
  role: z.enum(appConfig.roles.entityRoles).optional(),
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
