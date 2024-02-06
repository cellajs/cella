import { z } from '@hono/zod-openapi';
import { idSchema, passwordSchema, slugSchema } from '../../schemas/common';
import { apiUserSchema } from '../users/schema';

export const inviteJsonSchema = z.object({
  organizationIdentifier: slugSchema.or(idSchema).optional(),
  emails: apiUserSchema.shape.email
    .openapi({
      description: 'The email of the user',
    })
    .array()
    .min(1),
});

export const acceptInviteJsonSchema = z.object({
  password: passwordSchema.optional(),
  oauth: z.enum(['google', 'microsoft', 'github']).optional(),
});
