import { z } from 'zod';

import { config } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { membershipsTable } from '../../db/schema/memberships';
import { idSchema, slugSchema } from '../../lib/common-schemas';

export const membershipSchema = createSelectSchema(membershipsTable);

export const apiMembershipSchema = membershipSchema.extend({
  inactive: z.boolean(),
  muted: z.boolean(),
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
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

export const membershipInfoSchema = z.object({
  id: apiMembershipSchema.shape.id,
  role: apiMembershipSchema.shape.role,
  archived: apiMembershipSchema.shape.inactive,
}).nullable();

export type membershipInfoType = z.infer<typeof membershipInfoSchema>;