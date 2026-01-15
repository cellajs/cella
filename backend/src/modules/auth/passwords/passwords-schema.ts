import { z } from '@hono/zod-openapi';
import { userSchema } from '#/modules/users/users-schema';
import { passwordSchema } from '#/utils/schema/common';

export const emailPasswordBodySchema = z.object({
  email: userSchema.shape.email,
  password: passwordSchema,
});
