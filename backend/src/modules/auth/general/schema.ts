import { z } from '@hono/zod-openapi';
import { userSchema } from '#/modules/users/schema';
import { idSchema } from '#/utils/schema/common';

export const emailBodySchema = z.object({
  email: userSchema.shape.email,
});
export const tokenWithDataSchema = z.object({
  email: z.email(),
  userId: idSchema.optional(),
});
