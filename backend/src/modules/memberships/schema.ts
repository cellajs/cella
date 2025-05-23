import { z } from 'zod';

import { config } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { membershipsTable } from '#/db/schema/memberships';
import { tokensTable } from '#/db/schema/tokens';
import { contextEntityTypeSchema, idOrSlugSchema, paginationQuerySchema, validEmailSchema } from '#/utils/schema/common';

const membershipSummarySelectSchema = createSelectSchema(membershipsTable);

export const membershipSchema = z.object({
  ...membershipSummarySelectSchema.omit({
    activatedAt: true,
    tokenId: true,
  }).shape,
});

export const membershipSummarySchema = z.object(
  membershipSummarySelectSchema.omit({
    createdAt: true,
    createdBy: true,
    modifiedAt: true,
    modifiedBy: true,
    tokenId: true,
    activatedAt: true,
  }).shape,
);

export const membershipCreateBodySchema = z.object({
  emails: validEmailSchema.array().min(1).max(50),
  role: membershipSchema.shape.role,
});

export const membershipUpdateBodySchema = z.object({
  role: membershipSummarySelectSchema.shape.role.optional(),
  muted: z.boolean().optional(),
  archived: z.boolean().optional(),
  order: z.number().optional(),
});

export const memberListQuerySchema = paginationQuerySchema.extend({
  idOrSlug: idOrSlugSchema,
  entityType: contextEntityTypeSchema,
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt']).default('createdAt').optional(),
  role: z.enum(config.rolesByType.entityRoles).default('member').optional(),
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
    role: true,
    createdAt: true,
    createdBy: true,
  })
  .extend({ expiresAt: z.string(), name: z.string().nullable() });
