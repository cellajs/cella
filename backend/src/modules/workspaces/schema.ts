import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { membershipsTable } from '../../db/schema/memberships';
import { workspacesTable } from '../../db/schema/workspaces';
import { idSchema, nameSchema, validSlugSchema } from '../../lib/common-schemas';

import { apiUserSchema } from '../users/schema';

export const membershipSchema = createSelectSchema(membershipsTable);

export const apiWorkspaceUserSchema = z.object({
  ...apiUserSchema.shape,
  workspaceRole: membershipSchema.shape.role,
});

export const apiWorkspacesSchema = z.object({
  ...createSelectSchema(workspacesTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  role: membershipSchema.shape.role.nullable(),
});

export const createWorkspaceJsonSchema = z.object({
  name: nameSchema,
  slug: validSlugSchema,
  idOrSlug: idSchema.or(validSlugSchema),
});
