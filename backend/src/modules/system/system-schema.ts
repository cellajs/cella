import { z } from '@hono/zod-openapi';
import { roles } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { mockSystemRoleBase } from '#/modules/system/system-mocks';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { batchResponseSchema, maxLength, uniqueIdsSchema, validEmailSchema } from '#/schemas';

export const inviteBodySchema = z.object({ emails: validEmailSchema.array().min(1).max(50) });

export const systemInviteResponseSchema = batchResponseSchema().extend({ invitesSentCount: z.number() });

export const sendNewsletterBodySchema = z.object({
  // An empty scope is allowed for the explicit toSelf preview mode.
  organizationIds: uniqueIdsSchema(),
  roles: z
    .array(z.enum(roles.all))
    .min(1, { message: 'Role selection is required' })
    .max(roles.all.length)
    .refine((items) => new Set(items).size === items.length, 'Roles must be unique'),
  subject: z.string().max(maxLength.field),
  content: z.string().max(maxLength.html),
});

const systemRoleSelectSchema = createSelectSchema(systemRolesTable);

export const systemRoleBaseSchema = systemRoleSelectSchema.omit({ createdAt: true, updatedAt: true }).openapi('SystemRoleBase', {
  description: 'Core fields for a system role assignment.',
  example: mockSystemRoleBase(),
  'x-tags': schemaTags('base', 'system', 'cella'),
});
