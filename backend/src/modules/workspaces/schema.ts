import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { workspacesTable } from '../../db/schema/workspaces';
import { idSchema, nameSchema, validSlugSchema } from '../../lib/common-schemas';
import { membershipInfoSchema } from '../memberships/schema';

export const workspaceSchema = z.object({
  ...createSelectSchema(workspacesTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  membership: membershipInfoSchema.nullable(),
});

export const workspaceBodySchema = z.object({
  name: nameSchema,
  slug: validSlugSchema,
  organizationId: idSchema,
});
