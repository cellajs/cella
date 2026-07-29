import { z } from '@hono/zod-openapi';
import { validEmailSchema } from '#/schemas';

export const emailBodySchema = z.object({
  email: validEmailSchema,
});
export const tokenWithDataSchema = z.object({
  email: z.email(),
  userId: z.string().optional(),
  inactiveMembershipId: z.string().optional(),
});
