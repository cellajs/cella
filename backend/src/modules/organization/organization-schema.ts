import { z } from '@hono/zod-openapi';
import { t } from 'i18next';
import { roles } from 'shared';
import { organizationsTable } from '#/db/schema/organizations';
import { authStrategiesEnum } from '#/db/schema/sessions';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import {
  entityCanSchema,
  excludeArchivedQuerySchema,
  fullCountsSchema,
  includeQuerySchema,
  languageSchema,
  maxLength,
  noDuplicateSlugsRefine,
  paginationQuerySchema,
  validCDNUrlSchema,
  validDomainsSchema,
  validNameSchema,
  validSlugSchema,
  validTempIdSchema,
  validUrlSchema,
} from '#/schemas';
import { mockOrganizationResponse } from '../../../mocks/mock-organization';

/** Schema for optional included data (requested via include query param) */
export const organizationIncludedSchema = z.object({
  membership: membershipBaseSchema.optional(),
  counts: fullCountsSchema.optional(),
});

export const organizationSchema = z
  .object({
    ...createSelectSchema(organizationsTable).omit({ restrictions: true }).shape,
    languages: z.array(languageSchema).min(1),
    emailDomains: z.array(z.string()),
    authStrategies: z.array(z.enum(authStrategiesEnum)),
    included: organizationIncludedSchema.optional(),
    can: entityCanSchema.optional(),
  })
  .openapi('Organization', {
    description: 'An organization with settings, restrictions, and membership context.',
    example: mockOrganizationResponse(),
  });

export const organizationWithMembershipSchema = organizationSchema.extend({
  included: organizationIncludedSchema.extend({ membership: membershipBaseSchema }),
});

const organizationCreateItemSchema = z.object({
  id: validTempIdSchema,
  name: validNameSchema,
  slug: validSlugSchema,
});

/** Array schema for batch creates - rejects duplicate slugs */
export const organizationCreateBodySchema = organizationCreateItemSchema
  .array()
  .min(1)
  .max(10)
  .refine(noDuplicateSlugsRefine, t('error:duplicate_slugs'));

export const organizationUpdateBodySchema = createInsertSchema(organizationsTable, {
  slug: validSlugSchema,
  name: validNameSchema,
  shortName: validNameSchema.nullable(),
  languages: z.array(languageSchema).min(1),
  defaultLanguage: languageSchema.optional(),
  emailDomains: validDomainsSchema,
  authStrategies: z.array(z.enum(authStrategiesEnum)).optional(),
  websiteUrl: validUrlSchema.nullable(),
  thumbnailUrl: validCDNUrlSchema.nullable(),
  bannerUrl: validCDNUrlSchema.nullable(),
  logoUrl: validCDNUrlSchema.nullable(),
  welcomeText: z.string().max(maxLength.html).nullable(),
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

export const organizationListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'name', 'createdAt']).default('createdAt').optional(),
  userId: z.string().max(maxLength.id).optional(),
  role: z.enum(roles.all).optional(),
  excludeArchived: excludeArchivedQuerySchema,
  include: includeQuerySchema,
});
