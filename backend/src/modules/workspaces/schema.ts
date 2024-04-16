import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { membershipsTable } from '../../db/schema/memberships';
import { workspacesTable } from '../../db/schema/workspaces';
import { nameSchema, paginationQuerySchema, validSlugSchema } from '../../lib/common-schemas';

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
  languages: z.array(z.string()),
  emailDomains: z.array(z.string()).nullable(),
  authStrategies: z.array(z.string()).nullable(),
  role: membershipSchema.shape.role.nullable(),
});

export const createWorkspaceJsonSchema = z.object({
  name: nameSchema,
  slug: validSlugSchema,
});

export const getUsersByProjectQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'name', 'email', 'workspaceRole', 'createdAt', 'lastSeenAt']).default('createdAt').optional(),
  role: z.enum(['admin', 'member']).default('member').optional(),
});

export const getWorkspacesQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'name', 'role', 'createdAt']).default('createdAt').optional(),
  }),
);
