import { z } from '@hono/zod-openapi';
import { allEntityRoles } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { systemRolesTable } from '#/db/schema/system-roles';
import { userSchema } from '#/modules/user/user-schema';

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
  roles: z.array(z.enum(allEntityRoles as [string, ...string[]])).min(1, { message: 'Role selection is required' }),
  subject: z.string(),
  content: z.string(),
});

export const systemRoleSchema = z.object(createSelectSchema(systemRolesTable).shape).openapi('SystemRole');

export const systemRoleBaseSchema = systemRoleSchema
  .omit({
    createdAt: true,
    modifiedAt: true,
  })
  .openapi('SystemRoleBase');
