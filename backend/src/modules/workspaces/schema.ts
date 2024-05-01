import { z } from 'zod';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { workspacesTable } from '../../db/schema/workspaces';
import { idSchema, nameSchema, validSlugSchema } from '../../lib/common-schemas';

import { apiUserSchema } from '../users/schema';
import { apiMembershipSchema } from '../memberships/schema';

export const apiWorkspaceUserSchema = z.object({
  ...apiUserSchema.shape,
  workspaceRole: apiMembershipSchema.shape.role,
});

export const apiWorkspacesSchema = z.object({
  ...createSelectSchema(workspacesTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  role: apiMembershipSchema.shape.role.nullable(),
});

export const createWorkspaceJsonSchema = z.object({
  name: nameSchema,
  slug: validSlugSchema,
});

export const updateWorkspaceJsonSchema = createInsertSchema(workspacesTable, {
  slug: validSlugSchema,
  name: nameSchema,
  organizationId: idSchema,
})
  .pick({
    slug: true,
    name: true,
    organizationId: true,
  })
  .partial();
