import { z } from '@hono/zod-openapi';
import { roles } from 'shared';
import { systemRolesTable } from '#/db/schema/system-roles';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { userSchema } from '#/modules/user/user-schema';
import { maxLength } from '#/schemas';
import { mockSystemRoleBase, mockSystemRoleResponse } from '../../../mocks/mock-system';

export const inviteBodySchema = z.object({
  emails: userSchema.shape.email.array().min(1).max(50),
});

export const sendNewsletterBodySchema = z.object({
  organizationIds: z.array(z.string().max(maxLength.id)),
  roles: z.array(z.enum(roles.all)).min(1, { message: 'Role selection is required' }),
  subject: z.string().max(maxLength.field),
  content: z.string().max(maxLength.html),
});

export const systemRoleSchema = z.object(createSelectSchema(systemRolesTable).shape).openapi('SystemRole', {
  description: 'A system-level role assignment for a user.',
  example: mockSystemRoleResponse(),
});

export const systemRoleBaseSchema = systemRoleSchema
  .omit({
    createdAt: true,
    modifiedAt: true,
  })
  .openapi('SystemRoleBase', {
    description: 'Core fields for a system role assignment.',
    example: mockSystemRoleBase(),
  });
