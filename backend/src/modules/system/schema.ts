import { config } from 'config';
import { z } from 'zod';
import { userSchema } from '../users/schema';

export const inviteBodySchema = z.object({
  emails: userSchema.shape.email.array().min(1).max(50),
});

export const sendNewsletterBodySchema = z.object({
  organizationIds: z.array(z.string()),
  roles: z.array(z.enum(config.rolesByType.entityRoles)).min(1, { message: 'Role selection is required' }),
  subject: z.string(),
  content: z.string(),
});
