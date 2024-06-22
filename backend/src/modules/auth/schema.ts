import { z } from 'zod';
import { passwordSchema } from '../../lib/common-schemas';
import { userSchema } from '../users/schema';

export const authBodySchema = z.object({
  email: userSchema.shape.email,
  password: passwordSchema,
  token: z.string().optional(),
});

export const emailBodySchema = z.object({
  email: userSchema.shape.email,
});
