import { z } from 'zod';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { workspacesTable } from '../../db/schema/workspaces';
import { idSchema, imageUrlSchema, nameSchema, validSlugSchema } from '../../lib/common-schemas';
import { membershipInfoSchema } from '../memberships/schema';

export const workspaceSchema = z.object({
  ...createSelectSchema(workspacesTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  membership: membershipInfoSchema.nullable(),
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
