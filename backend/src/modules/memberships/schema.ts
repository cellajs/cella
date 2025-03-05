import { z } from 'zod';

import { config } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { membershipsTable } from '#/db/schema/memberships';
import { contextEntityTypeSchema, idOrSlugSchema, paginationQuerySchema } from '#/utils/schema/common';
import { userSchema } from '../users/schema';

const membershipTableSchema = createSelectSchema(membershipsTable);

export const membershipSchema = z.object({
  ...membershipTableSchema.omit({
    activatedAt: true,
    tokenId: true,
  }).shape,
});

export const createMembershipsBodySchema = z.object({
  emails: userSchema.shape.email.array().min(1).max(50),
  role: membershipSchema.shape.role,
});

export const updateMembershipBodySchema = z.object({
  role: membershipTableSchema.shape.role.optional(),
  muted: z.boolean().optional(),
  archived: z.boolean().optional(),
  order: z.number().optional(),
});

export const baseMembersQuerySchema = z.object({
  idOrSlug: idOrSlugSchema,
  entityType: contextEntityTypeSchema,
});

export const membershipInfoSchema = z.object(
  membershipTableSchema.omit({
    createdAt: true,
    createdBy: true,
    modifiedAt: true,
    modifiedBy: true,
    tokenId: true,
    activatedAt: true,
    userId: true,
    type: true,
  }).shape,
);

export const membersQuerySchema = paginationQuerySchema.extend({
  ...baseMembersQuerySchema.shape,
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt']).default('createdAt').optional(),
  role: z.enum(config.rolesByType.entityRoles).default('member').optional(),
});

export const membersSchema = z.object({
  ...userSchema.shape,
  membership: membershipInfoSchema,
});

export const memberInvitationsQuerySchema = paginationQuerySchema.extend({
  ...baseMembersQuerySchema.shape,
  sort: z.enum(['email', 'role', 'expiresAt', 'createdAt', 'createdBy']).default('createdAt').optional(),
});

export const memberInvitationsSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: z.enum(config.rolesByType.entityRoles).nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
});

export type membershipInfoType = z.infer<typeof membershipInfoSchema>;
