import { z } from '@hono/zod-openapi';
import { membershipSchema } from '#/modules/memberships/schema';
import { idSchema } from '#/utils/schema/common';
import { userSchema } from '#/modules/users/schema';

export const emailBodySchema = z.object({
  email: userSchema.shape.email,
});
export const tokenWithDataSchema = z.object({
  email: z.email(),
  role: z.union([membershipSchema.shape.role, z.null()]),
  userId: idSchema.optional(),
  organizationName: z.string().optional(),
  organizationSlug: z.string().optional(),
  organizationId: z.string().optional(),
});
