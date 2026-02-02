import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { membershipsTable } from '#/db/schema/memberships';
import { userBaseSchema } from '#/modules/user/user-schema-base';
import { contextEntityTypeSchema, idSchema, paginationQuerySchema, validEmailSchema } from '#/schemas';
import {
  mockInactiveMembershipResponse,
  mockMembershipBase,
  mockMembershipResponse,
} from '../../../mocks/mock-membership';

export const membershipSchema = z
  .object(createSelectSchema(membershipsTable).shape)
  .openapi('Membership', { example: mockMembershipResponse() });

export const inactiveMembershipSchema = z
  .object(createSelectSchema(inactiveMembershipsTable).shape)
  .openapi('InactiveMembership', { example: mockInactiveMembershipResponse() });

export const membershipBaseSchema = membershipSchema
  .omit({
    createdAt: true,
    createdBy: true,
    modifiedAt: true,
    modifiedBy: true,
    uniqueKey: true,
  })
  .openapi('MembershipBase', { example: mockMembershipBase() });

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
  id: idSchema,
  entityType: contextEntityTypeSchema,
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt']).default('createdAt').optional(),
  role: z.enum(appConfig.entityRoles).optional(),
});

export const pendingMembershipListQuerySchema = paginationQuerySchema.extend({
  id: idSchema,
  entityType: contextEntityTypeSchema,
  sort: z.enum(['createdAt']).default('createdAt').optional(),
});

export const pendingMembershipSchema = z.object({
  id: z.string(),
  email: userBaseSchema.shape.email,
  thumbnailUrl: userBaseSchema.shape.thumbnailUrl.nullable(),
  role: membershipSchema.shape.role.nullable(),
  createdAt: membershipSchema.shape.createdAt,
  createdBy: membershipSchema.shape.createdBy.nullable(),
});
