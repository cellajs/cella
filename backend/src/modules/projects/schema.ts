import { z } from 'zod';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { projectsTable } from '../../db/schema/projects';
import { colorSchema, membershipsCountSchema, idSchema, nameSchema, paginationQuerySchema, validSlugSchema } from '../../lib/common-schemas';
import { membershipInfoSchema } from '../memberships/schema';

export const projectSchema = z.object({
  ...createSelectSchema(projectsTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  membership: membershipInfoSchema.nullable(),
  workspaceId: z.string().nullish(),
  counts: membershipsCountSchema,
});

export const createProjectBodySchema = z.object({
  name: nameSchema,
  slug: validSlugSchema,
  color: colorSchema,
  organizationId: idSchema,
});

export const createProjectQuerySchema = z.object({
  workspaceId: idSchema.optional(),
});

export const getProjectsQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'name', 'userRole', 'createdAt']).default('createdAt').optional(),
    organizationId: idSchema.optional(),
    workspaceId: idSchema.optional(),
    requestedUserId: idSchema.optional(),
  }),
);

export const updateProjectBodySchema = createInsertSchema(projectsTable, {
  slug: validSlugSchema,
  name: nameSchema,
  color: colorSchema,
})
  .pick({
    slug: true,
    name: true,
    color: true,
  })
  .merge(
    z.object({
      workspaceId: idSchema.nullable(),
    }),
  );
