import { z } from '@hono/zod-openapi';
import { userSchema } from '#/modules/user/user-schema';
import { passwordInputSchema, passwordSchema } from '#/schemas';

export const emailPasswordBodySchema = z.object({
  email: userSchema.shape.email,
  password: passwordSchema,
});

/** Sign-in body schema: no password strength check (accepts any existing password) */
export const signInBodySchema = z.object({
  email: userSchema.shape.email,
  password: passwordInputSchema,
});
