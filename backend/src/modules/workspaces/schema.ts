import { z } from 'zod';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { workspacesTable } from '../../db/schema/workspaces';
import { idSchema, nameSchema, validSlugSchema } from '../../lib/common-schemas';
import { membershipInfoSchema } from '../memberships/schema';

export const apiWorkspaceSchema = z.object({
  ...createSelectSchema(workspacesTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  membership: membershipInfoSchema,
});

export const createWorkspaceJsonSchema = z.object({
  name: nameSchema,
  slug: validSlugSchema,
  organizationId: idSchema,
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
