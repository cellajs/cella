import { z } from '@hono/zod-openapi';
import { userSchema } from '#/modules/user/user-schema';

export const magicLinkBodySchema = z.object({
  email: userSchema.shape.email,
});
