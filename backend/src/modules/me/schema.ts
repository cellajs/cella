import { z } from 'zod';

import { config } from 'config';
import { idSchema, imageUrlSchema, nameSchema, slugSchema } from '../../lib/common-schemas';
import { membershipInfoSchema } from '../memberships/schema';
import { apiUserSchema } from '../users/schema';

export const meUserSchema = apiUserSchema.extend({
  electricJWTToken: z.string(),
  sessions: z.array(z.object({ id: z.string(), type: z.enum(['MOBILE', 'DESKTOP']), current: z.boolean(), expiresAt: z.string() })),
});

const menuItemSchema = z.object({
  slug: slugSchema,
  id: idSchema,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  name: nameSchema,
  thumbnailUrl: imageUrlSchema.nullish(),
  entity: z.enum(config.contextEntityTypes),
  membership: membershipInfoSchema,
  parentId: z.string().optional(),
});

const menuSchema = z.array(
  z.object({
    ...menuItemSchema.shape,
    submenu: z.array(menuItemSchema).optional(),
  }),
);

export const userMenuSchema = z.object({
  organizations: menuSchema,
  workspaces: menuSchema,
});
