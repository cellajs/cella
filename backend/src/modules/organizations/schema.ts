import { z } from 'zod';

import { config } from 'config';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { organizationsTable } from '#/db/schema/organizations';
import type { ValidEntityTypes } from '#/utils/counts';
import {
  languageSchema,
  paginationQuerySchema,
  validDomainsSchema,
  validImageUrlSchema,
  validNameSchema,
  validSlugSchema,
  validUrlSchema,
} from '#/utils/schema/common';
import { membershipInfoSchema } from '../memberships/schema';

export const membershipsCountSchema = z.object({
  membership: z.object({
    admin: z.number(),
    member: z.number(),
    total: z.number(),
  }),
});

/** Type assertion to avoid "ReferenceError: Buffer is not defined" when using `hasField`.
 * Redundant fields will be filtered out in `getRelatedEntityCounts`.
 */
//TODO: find way to fix ?
export const relatedEntitiesCountSchema = z.object(
  [...config.productEntityTypes, ...config.contextEntityTypes].reduce(
    (acc, key) => {
      acc[key as ValidEntityTypes<'organizationId'>] = z.number();
      return acc;
    },
    {} as Record<ValidEntityTypes<'organizationId'>, z.ZodNumber>,
  ),
);

export const organizationSchema = z.object({
  ...createSelectSchema(organizationsTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  defaultLanguage: languageSchema,
  languages: z.array(languageSchema).min(1),
  emailDomains: z.array(z.string()),
  authStrategies: z.array(z.string()),
  membership: membershipInfoSchema.nullable(),
  counts: membershipsCountSchema,
});

export const organizationWithMembershipSchema = organizationSchema.extend({ membership: membershipInfoSchema });

export const createOrganizationBodySchema = z.object({
  name: validNameSchema,
  slug: validSlugSchema,
});

export const sendNewsletterBodySchema = z.object({
  organizationIds: z.array(z.string()),
  roles: z.array(z.enum(config.rolesByType.entityRoles)).min(1, { message: 'Role selection is required' }),
  subject: z.string(),
  content: z.string(),
});

export const updateOrganizationBodySchema = createInsertSchema(organizationsTable, {
  slug: validSlugSchema,
  name: validNameSchema,
  shortName: validNameSchema.nullable(),
  languages: z.array(languageSchema).min(1),
  defaultLanguage: languageSchema.optional(),
  emailDomains: validDomainsSchema,
  authStrategies: z.array(z.string()).optional(),
  websiteUrl: validUrlSchema.nullable(),
  thumbnailUrl: validImageUrlSchema.nullable(),
  bannerUrl: validImageUrlSchema.nullable(),
  logoUrl: validImageUrlSchema.nullable(),
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
