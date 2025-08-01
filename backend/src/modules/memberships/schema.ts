import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { membershipsTable } from '#/db/schema/memberships';
import { tokensTable } from '#/db/schema/tokens';
import { contextEntityTypeSchema, idOrSlugSchema, paginationQuerySchema, validEmailSchema } from '#/utils/schema/common';

export const membershipSchema = z.object({
  ...createSelectSchema(membershipsTable).omit({
    activatedAt: true,
    tokenId: true,
  }).shape,
});

export const membershipSummarySchema = z.object(
  membershipSchema.omit({
    createdAt: true,
    createdBy: true,
    modifiedAt: true,
    modifiedBy: true,
  }).shape,
);

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
  role: z.enum(appConfig.rolesByType.entityRoles).optional(),
});

export const pendingInvitationListQuerySchema = paginationQuerySchema.extend({
  idOrSlug: idOrSlugSchema,
  entityType: contextEntityTypeSchema,
  sort: z.enum(['email', 'role', 'expiresAt', 'createdAt', 'createdBy']).default('createdAt').optional(),
});

export const pendingInvitationSchema = createSelectSchema(tokensTable)
  .pick({
    id: true,
    email: true,
    createdAt: true,
    createdBy: true,
    role: true,
  })
  .extend({ expiresAt: z.string(), name: z.string().nullable() });
