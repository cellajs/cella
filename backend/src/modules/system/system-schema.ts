import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';
import { appConfig } from 'shared';
import { systemRolesTable } from '#/db/schema/system-roles';
import { userSchema } from '#/modules/user/user-schema';
import { mockSystemRoleBase, mockSystemRoleResponse } from '../../../mocks/mock-system';

export const inviteBodySchema = z.object({
  emails: userSchema.shape.email.array().min(1).max(50),
});

export const sendNewsletterBodySchema = z.object({
  organizationIds: z.array(z.string()),
  roles: z.array(z.enum(appConfig.entityRoles)).min(1, { message: 'Role selection is required' }),
  subject: z.string(),
  content: z.string(),
});

export const systemRoleSchema = z
  .object(createSelectSchema(systemRolesTable).shape)
  .openapi('SystemRole', { example: mockSystemRoleResponse() });

export const systemRoleBaseSchema = systemRoleSchema
  .omit({
    createdAt: true,
    modifiedAt: true,
  })
  .openapi('SystemRoleBase', { example: mockSystemRoleBase() });
