import { z } from '@hono/zod-openapi';
import { roles } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { userSchema } from '#/modules/user/user-schema';
import { maxLength } from '#/schemas';
import { mockSystemRoleBase, mockSystemRoleResponse } from './system-mocks';

export const inviteBodySchema = z.object({
  emails: userSchema.shape.email.array().min(1).max(50),
});

export const sendNewsletterBodySchema = z.object({
  organizationIds: z.array(z.string().max(maxLength.id)),
  roles: z.array(z.enum(roles.all)).min(1, { message: 'Role selection is required' }),
  subject: z.string().max(maxLength.field),
  content: z.string().max(maxLength.html),
});

const systemRoleSelectSchema = createSelectSchema(systemRolesTable);

export const systemRoleSchema = z.object(systemRoleSelectSchema.shape).openapi('SystemRole', {
  description: 'A system-level role assignment for a user.',
  example: mockSystemRoleResponse(),
  'x-tags': schemaTags('data', 'system', 'cella'),
});

export const systemRoleBaseSchema = systemRoleSelectSchema
  .omit({
    createdAt: true,
    updatedAt: true,
  })
  .openapi('SystemRoleBase', {
    description: 'Core fields for a system role assignment.',
    example: mockSystemRoleBase(),
    'x-tags': schemaTags('base', 'system', 'cella'),
  });
