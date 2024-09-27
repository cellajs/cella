import { z } from 'zod';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { labelsTable } from '#/db/schema/labels';
import { workspacesTable } from '#/db/schema/workspaces';
import { idSchema, imageUrlSchema, nameSchema, validSlugSchema } from '#/utils/schema/common-schemas';
import { membersSchema } from '../general/schema';
import { membershipInfoSchema } from '../memberships/schema';
import { projectSchema } from '../projects/schema';

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
  projects: z.array(projectSchema),
  members: z.array(membersSchema),
  labels: z.array(
    z.object({
      ...createSelectSchema(labelsTable).shape,
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
  bannerUrl: imageUrlSchema,
})
  .pick({
    slug: true,
    name: true,
    thumbnailUrl: true,
    organizationId: true,
    bannerUrl: true,
  })
  .partial();
