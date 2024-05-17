import { z } from 'zod';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { projectsTable } from '../../db/schema/projects';
import { colorSchema, idSchema, nameSchema, paginationQuerySchema, validSlugSchema } from '../../lib/common-schemas';

import { apiMembershipSchema } from '../memberships/schema';

export const apiProjectSchema = z.object({
  ...createSelectSchema(projectsTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  role: apiMembershipSchema.shape.role.nullable(),
});

export const createProjectJsonSchema = z.object({
  name: nameSchema,
  slug: validSlugSchema,
  color: colorSchema,
});

export const getProjectsQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'name', 'userRole', 'createdAt']).default('createdAt').optional(),
    workspace: idSchema.optional(),
  }),
);

export const updateProjectJsonSchema = createInsertSchema(projectsTable, {
  slug: validSlugSchema,
  name: nameSchema,
  color: colorSchema,
  workspaceId: idSchema,
}).pick({
  slug: true,
  name: true,
  color: true,
});
