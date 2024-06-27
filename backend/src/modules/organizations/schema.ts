import { z } from 'zod';

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { organizationsTable } from '../../db/schema/organizations';
import {
  membershipsCountSchema,
  imageUrlSchema,
  nameSchema,
  paginationQuerySchema,
  validDomainsSchema,
  validSlugSchema,
  validUrlSchema,
} from '../../lib/common-schemas';
import { membershipInfoSchema } from '../memberships/schema';
import { i18n } from '../../lib/i18n';

export const organizationSchema = z.object({
  ...createSelectSchema(organizationsTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  languages: z.array(z.string()),
  emailDomains: z.array(z.string()),
  authStrategies: z.array(z.string()),
  membership: membershipInfoSchema.nullable(),
  counts: membershipsCountSchema,
});

export const createOrganizationBodySchema = z.object({
  name: nameSchema,
  slug: validSlugSchema,
});

export const updateOrganizationBodySchema = createInsertSchema(organizationsTable, {
  slug: validSlugSchema,
  name: nameSchema,
  shortName: nameSchema,
  languages: z
    .array(z.string())
    .min(1, { message: i18n.t('backend:invalid.min_items', { items_count: 'one', item: 'language' }) })
    .optional(),
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
