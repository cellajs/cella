import { z } from 'zod';

import { idSchema, imageUrlSchema, nameSchema, slugSchema } from '../../lib/common-schemas';
import { apiMembershipSchema } from '../memberships/schema';
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
  archived: z.boolean(),
  muted: z.boolean(),
  role: apiMembershipSchema.shape.role,
  membershipId: idSchema,
  type: apiMembershipSchema.shape.type,
  mainId: z.string().optional(),
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
