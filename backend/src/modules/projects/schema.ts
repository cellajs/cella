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

export const apiProjectListSchema = z.object({
  ...apiProjectSchema.shape,
  archived: z.boolean().nullable(),
});

export const createProjectJsonSchema = z.object({
  name: nameSchema,
  slug: validSlugSchema,
  color: colorSchema,
  workspace: idSchema.optional(),
});

export const getUserProjectsParamSchema = z.object({
  userId: idSchema,
});

export const apiUserProjectSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.string(),
  }),
);

export const getProjectsQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'name', 'userRole', 'createdAt']).default('createdAt').optional(),
    organization: idSchema.optional(),
    workspace: idSchema.optional(),
  }),
);

export const updateProjectJsonSchema = createInsertSchema(projectsTable, {
  slug: validSlugSchema,
  name: nameSchema,
  color: colorSchema,
}).pick({
  slug: true,
  name: true,
  color: true,
});

export const getUsersByProjectQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'name', 'email', 'createdAt']).default('createdAt').optional(),
});
