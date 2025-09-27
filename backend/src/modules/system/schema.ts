import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { userSchema } from '#/modules/users/schema';

export const inviteBodySchema = z.object({
  emails: userSchema.shape.email.array().min(1).max(50),
});

export const preasignedURLQuerySchema = z.object({
  key: z.string(),
  isPublic: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === 'true')
    .default(false),
});

export const sendNewsletterBodySchema = z.object({
  organizationIds: z.array(z.string()),
  roles: z.array(z.enum(appConfig.roles.entityRoles)).min(1, { message: 'Role selection is required' }),
  subject: z.string(),
  content: z.string(),
});
