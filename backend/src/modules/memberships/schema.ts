import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { membershipsTable } from '../../db/schema/memberships';
import { idSchema } from '../../lib/common-schemas';

export const membershipSchema = createSelectSchema(membershipsTable).extend({
  inactive: z.boolean().default(false),
  muted: z.boolean().default(false),
  resourceType: z.string().default('organization'),
});

export const membershipUserParamSchema = z.object({
  id: idSchema,
});

export const deleteMembersQuerySchema = z.object({
  ids: z.union([z.string(), z.array(z.string())]),
  resourceIdentifier: z.string(),
});

export const updateMembershipJsonSchema = z.object({
  role: membershipSchema.shape.role.optional(),
  resourceIdentifier: z.string(),
  muted: z.boolean().optional(),
  inactive: z.boolean().optional(),
});
