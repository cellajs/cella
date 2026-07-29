import { z } from '@hono/zod-openapi';
import { roles } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { maxLength, validEmailSchema, validUuidSchema } from '#/schemas';
import { mockSystemRoleBase, mockSystemRoleResponse } from './system-mocks';

export const inviteBodySchema = z.object({
  emails: validEmailSchema.array().min(1).max(50),
});

export const sendNewsletterBodySchema = z.object({
  // An empty scope is allowed for the explicit toSelf preview mode.
  organizationIds: validUuidSchema
    .array()
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'Organization IDs must be unique'),
  roles: z
    .array(z.enum(roles.all))
    .min(1, { message: 'Role selection is required' })
    .max(roles.all.length)
    .refine((items) => new Set(items).size === items.length, 'Roles must be unique'),
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
