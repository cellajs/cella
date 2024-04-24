import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { membershipsTable } from '../../db/schema/memberships';
import { idSchema, slugSchema } from '../../lib/common-schemas';

export const membershipSchema = createSelectSchema(membershipsTable).extend({
  inactive: z.boolean().default(false),
  muted: z.boolean().default(false),
  resourceType: z.string().default('organization'),
});

export const updateMembershipParamSchema = z.object({
  idOrSlug: idSchema.or(slugSchema),
  user: idSchema,
});

export const updateMembershipJsonSchema = z.object({
  role: membershipSchema.shape.role.optional(),
  muted: z.boolean().optional(),
  inactive: z.boolean().optional(),
});

export const deleteMembersParamSchema = z.object({
  idOrSlug: idSchema.or(slugSchema),
});

export const deleteMembersQuerySchema = z.object({
  ids: z.union([z.string(), z.array(z.string())]),
});
