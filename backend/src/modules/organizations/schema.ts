import { z } from 'zod';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { organizationsTable } from '../../db/schema/organizations';
import {
  imageUrlSchema,
  nameSchema,
  paginationQuerySchema,
  validDomainsSchema,
  validSlugSchema,
  validUrlSchema,
} from '../../lib/common-schemas';
import { apiMembershipSchema } from '../memberships/schema';

export const apiOrganizationSchema = z.object({
  ...createSelectSchema(organizationsTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  languages: z.array(z.string()),
  emailDomains: z.array(z.string()).nullable(),
  authStrategies: z.array(z.string()).nullable(),
  userRole: apiMembershipSchema.shape.role.nullable(),
  counts: z.object({
    admins: z.number(),
    members: z.number(),
  }),
});

export const createOrganizationJsonSchema = z.object({
  name: nameSchema,
  slug: validSlugSchema,
});

export const updateOrganizationJsonSchema = createInsertSchema(organizationsTable, {
  slug: validSlugSchema,
  name: nameSchema,
  shortName: nameSchema,
  languages: z.array(z.string()).min(1).optional(),
  emailDomains: validDomainsSchema,
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
    color: true,
    thumbnailUrl: true,
    logoUrl: true,
    bannerUrl: true,
    websiteUrl: true,
    welcomeText: true,
    authStrategies: true,
    chatSupport: true,
  })
  .partial();

export const getOrganizationsQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'name', 'userRole', 'createdAt']).default('createdAt').optional(),
  }),
);
