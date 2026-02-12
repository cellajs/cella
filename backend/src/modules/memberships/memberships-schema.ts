import { z } from '@hono/zod-openapi';
import { roles } from 'shared';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { membershipsTable } from '#/db/schema/memberships';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { contextEntityTypeSchema, paginationQuerySchema, validEmailSchema, validIdSchema } from '#/schemas';
import { userBaseSchema } from '#/schemas/user-schema-base';
import {
  mockInactiveMembershipResponse,
  mockMembershipBase,
  mockMembershipResponse,
} from '../../../mocks/mock-membership';

/** Schema for entity roles enum - uses literal types from appConfig */
export const entityRoleSchema = z.enum(roles.all);

export const membershipSchema = z
  .object({
    ...createSelectSchema(membershipsTable).shape,
    // Override enum columns with explicit schemas to preserve literal types
    role: entityRoleSchema,
    contextType: contextEntityTypeSchema,
  })
  .openapi('Membership', { example: mockMembershipResponse() });

export const inactiveMembershipSchema = z
  .object({
    ...createSelectSchema(inactiveMembershipsTable).shape,
    // Override enum columns with explicit schemas to preserve literal types
    role: entityRoleSchema,
    contextType: contextEntityTypeSchema,
  })
  .openapi('InactiveMembership', { example: mockInactiveMembershipResponse() });

export const membershipBaseSchema = membershipSchema
  .omit({
    createdAt: true,
    createdBy: true,
    modifiedAt: true,
    modifiedBy: true,
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
  displayOrder: z.number().optional(),
});

export const memberListQuerySchema = paginationQuerySchema.extend({
  entityId: validIdSchema,
  entityType: contextEntityTypeSchema,
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt']).default('createdAt').optional(),
  role: z.enum(roles.all).optional(),
});

export const pendingMembershipListQuerySchema = paginationQuerySchema.extend({
  entityId: validIdSchema,
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
