import { z } from 'zod';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { projectsTable } from '#/db/schema/projects';
import { idSchema, imageUrlSchema, membershipsCountSchema, nameSchema, paginationQuerySchema, validSlugSchema } from '#/lib/common-schemas';
import { membershipInfoSchema } from '../memberships/schema';

export const projectSchema = z.object({
  ...createSelectSchema(projectsTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  membership: membershipInfoSchema.nullable(),
  workspaceId: z.string().nullish(),
  counts: membershipsCountSchema,
});

export type ApiProject = z.infer<typeof projectSchema>;

export const createProjectBodySchema = z.object({
  name: nameSchema,
  slug: validSlugSchema,
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
    userId: idSchema.optional(),
  }),
);

export const updateProjectBodySchema = createInsertSchema(projectsTable, {
  slug: validSlugSchema,
  name: nameSchema,
  thumbnailUrl: imageUrlSchema,
})
  .pick({
    slug: true,
    name: true,
    thumbnailUrl: true,
  })
  .merge(
    z.object({
      workspaceId: idSchema.nullable(),
    }),
  );
