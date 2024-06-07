import { z } from 'zod';
import { passwordSchema } from '../../lib/common-schemas';
import { apiUserSchema } from '../users/schema';

export const signInJsonSchema = z.object({
  email: apiUserSchema.shape.email,
  password: passwordSchema,
  token: z.string().optional(),
});

export const signUpJsonSchema = z.object({
  email: apiUserSchema.shape.email,
  password: passwordSchema,
  token: z.string().optional(),
});

export const checkEmailJsonSchema = z.object({
  email: apiUserSchema.shape.email,
});

export const emailExistsJsonSchema = z.object({
  exists: z.boolean(),
});
