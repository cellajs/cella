import { z } from '@hono/zod-openapi';
import { userSchema } from '#/modules/user/user-schema';
import { passwordSchema } from '#/schemas';

export const emailPasswordBodySchema = z.object({
  email: userSchema.shape.email,
  password: passwordSchema,
});
