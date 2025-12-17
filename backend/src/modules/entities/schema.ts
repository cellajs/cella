import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { contextEntityBaseSchema } from '#/modules/entities/schema-base';
import { membershipBaseSchema } from '#/modules/memberships/schema';

// Extend base entity schema with membership base data
export const contextEntityWithMembershipSchema = contextEntityBaseSchema.extend({
  membership: membershipBaseSchema,
  createdAt: z.string(),
});

export const checkSlugBodySchema = z.object({
  slug: z.string(),
  entityType: z.enum(['user', ...appConfig.contextEntityTypes]),
});
