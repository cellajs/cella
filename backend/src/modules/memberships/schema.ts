import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { membershipsTable } from '#/db/schema/memberships';
import { contextEntityTypeSchema, idOrSlugSchema, paginationQuerySchema, validEmailSchema } from '#/utils/schema/common';
import { userBaseSchema } from '../users/schema-base';

export const membershipSchema = createSelectSchema(membershipsTable).openapi('MembershipSchema');

export const membershipBaseSchema = membershipSchema
  .omit({
    createdAt: true,
    createdBy: true,
    modifiedAt: true,
    modifiedBy: true,
  })
  .openapi('MembershipBaseSchema');

export const membershipCreateBodySchema = z.object({
  emails: validEmailSchema.array().min(1).max(50),
  role: membershipSchema.shape.role,
});

export const membershipUpdateBodySchema = z.object({
  role: membershipSchema.shape.role.optional(),
  muted: z.boolean().optional(),
  archived: z.boolean().optional(),
  order: z.number().optional(),
});

export const memberListQuerySchema = paginationQuerySchema.extend({
  idOrSlug: idOrSlugSchema,
  entityType: contextEntityTypeSchema,
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt']).default('createdAt').optional(),
  role: z.enum(appConfig.roles.entityRoles).optional(),
});

export const pendingMembershipListQuerySchema = paginationQuerySchema.extend({
  idOrSlug: idOrSlugSchema,
  entityType: contextEntityTypeSchema,
  sort: z.enum(['createdAt']).default('createdAt').optional(),
});

export const pendingMembershipSchema = z.object({
  id: z.string(),
  tokenId: z.string().nullable(),
  email: userBaseSchema.shape.email,
  thumbnailUrl: userBaseSchema.shape.thumbnailUrl.nullable(),
  role: membershipSchema.shape.role.nullable(),
  createdAt: membershipSchema.shape.createdAt,
  createdBy: membershipSchema.shape.createdBy.nullable(),
});
