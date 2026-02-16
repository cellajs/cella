import { z } from '@hono/zod-openapi';
import { userSchema } from '#/modules/user/user-schema';

export const emailBodySchema = z.object({
  email: userSchema.shape.email,
});
export const tokenWithDataSchema = z.object({
  email: z.email(),
  userId: z.string().optional(),
  inactiveMembershipId: z.string().optional(),
});
