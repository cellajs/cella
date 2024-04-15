import { z } from 'zod';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { membershipsTable } from '../../db/schema/memberships';
import { organizationsTable } from '../../db/schema/organizations';
import { imageUrlSchema, nameSchema, paginationQuerySchema, validSlugSchema, validUrlSchema } from '../../lib/common-schemas';

import { apiUserSchema } from '../users/schema';

export const membershipSchema = createSelectSchema(membershipsTable);

export const apiOrganizationUserSchema = z.object({
  ...apiUserSchema.shape,
  organizationRole: membershipSchema.shape.role,
});

export const apiOrganizationSchema = z.object({
  ...createSelectSchema(organizationsTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  languages: z.array(z.string()),
  emailDomains: z.array(z.string()).nullable(),
  authStrategies: z.array(z.string()).nullable(),
  userRole: membershipSchema.shape.role.nullable(),
  counts: z.object({
    admins: z.number(),
    members: z.number(),
  }),
});
// .extend({
//   createdAt: z.string(),
//   modifiedAt: z.string().nullable(),
//   languages: z.array(z.string()).nullable(),
//   emailDomains: z.array(z.string()).nullable(),
//   authStrategies: z.array(z.string()).nullable(),
//   userRole: membershipSchema.shape.role,
// });

export const createOrganizationJsonSchema = z.object({
  name: nameSchema,
  slug: validSlugSchema,
});

export const updateOrganizationJsonSchema = createInsertSchema(organizationsTable, {
  slug: validSlugSchema,
  name: nameSchema,
  shortName: nameSchema,
  languages: z.array(z.string()).min(1).optional(),
  emailDomains: z.array(z.string()).optional(),
  authStrategies: z.array(z.string()).optional(),
  websiteUrl: validUrlSchema,
  thumbnailUrl: imageUrlSchema,
  bannerUrl: imageUrlSchema,
  logoUrl: imageUrlSchema,
})
  .pick({
    slug: true,
    name: true,
    shortName: true,
    country: true,
    timezone: true,
    defaultLanguage: true,
    languages: true,
    notificationEmail: true,
    emailDomains: true,
    brandColor: true,
    thumbnailUrl: true,
    logoUrl: true,
    bannerUrl: true,
    websiteUrl: true,
    welcomeText: true,
    authStrategies: true,
    chatSupport: true,
  })
  .partial();

export const userMenuSchema = z.object({
  organizations: z.object({
    active: z.array(apiOrganizationSchema),
    inactive: z.array(apiOrganizationSchema),
    canCreate: z.boolean(),
  }),
});

export const getUsersByOrganizationQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'name', 'email', 'organizationRole', 'createdAt', 'lastSeenAt']).default('createdAt').optional(),
  role: z.enum(['admin', 'member']).default('member').optional(),
});

export const getOrganizationsQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'name', 'userRole', 'createdAt']).default('createdAt').optional(),
  }),
);
