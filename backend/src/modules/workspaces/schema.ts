import { z } from 'zod';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { workspacesTable } from '../../db/schema/workspaces';
import { idSchema, imageUrlSchema, nameSchema, validSlugSchema } from '../../lib/common-schemas';
import { membershipInfoSchema } from '../memberships/schema';
import { projectsTable } from '../../db/schema/projects';
import { userSchema } from '../users/schema';

export const workspaceSchema = z.object({
  ...createSelectSchema(workspacesTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  membership: membershipInfoSchema.nullable(),
});

export const workspaceWithProjectSchema = z.object({
  workspace: z.object({
    ...createSelectSchema(workspacesTable).shape,
    createdAt: z.string(),
    modifiedAt: z.string().nullable(),
    membership: membershipInfoSchema.nullable(),
  }),
  relatedProjects: z.array(
    z.object({
      ...createSelectSchema(projectsTable).shape,
      createdAt: z.string(),
      modifiedAt: z.string().nullable(),
      membership: membershipInfoSchema.nullable(),
      workspaceId: z.string().nullish(),
    }),
  ),
  workspaceMembers: z.array(
    z.object({
      ...userSchema.shape,
      membership: membershipInfoSchema,
      projectId: z.string().nullable(),
    }),
  ),
});

export const createWorkspaceBodySchema = z.object({
  name: nameSchema,
  slug: validSlugSchema,
  organizationId: idSchema,
});

export const updateWorkspaceBodySchema = createInsertSchema(workspacesTable, {
  name: nameSchema,
  slug: validSlugSchema,
  organizationId: idSchema,
  thumbnailUrl: imageUrlSchema,
})
  .pick({
    slug: true,
    name: true,
    thumbnailUrl: true,
    organizationId: true,
  })
  .partial();
