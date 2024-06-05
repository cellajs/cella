import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { membershipsTable } from '../../db/schema/memberships';
import { idSchema, slugSchema } from '../../lib/common-schemas';
import { config } from 'config';

export const membershipSchema = createSelectSchema(membershipsTable);

export const apiMembershipSchema = membershipSchema.extend({
  inactive: z.boolean().nullable(),
  muted: z.boolean().nullable(),
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
});

export const updateMembershipParamSchema = z.object({
  membership: idSchema,
});

export const updateMembershipJsonSchema = z.object({
  role: membershipSchema.shape.role.optional(),
  muted: z.boolean().optional(),
  inactive: z.boolean().optional(),
});

export const deleteMembersQuerySchema = z.object({
  idOrSlug: idSchema.or(slugSchema),
  entityType: z.enum(config.contextEntityTypes),
  ids: z.union([z.string(), z.array(z.string())]),
});
