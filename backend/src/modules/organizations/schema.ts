import { z } from 'zod';

import { config } from 'config';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { organizationsTable } from '#/db/schema/organizations';
import type { ValidEntities } from '#/modules/entities/helpers/get-related-entities';
import { membershipSummarySchema } from '#/modules/memberships/schema';
import {
  languageSchema,
  paginationQuerySchema,
  validDomainsSchema,
  validImageKeySchema,
  validNameSchema,
  validSlugSchema,
  validUrlSchema,
} from '#/utils/schema/common';

/** Type assertion to avoid "ReferenceError: Buffer is not defined" when using `hasField`.
 * Redundant fields will be filtered out in `getRelatedEntityCounts`.
 */
//TODO: find way to fix or can we simplify it?
const entityCountSchema = z.object(
  [...config.productEntityTypes, ...config.contextEntityTypes].reduce(
    (acc, key) => {
      acc[key as ValidEntities<'organizationId'>] = z.number();
      return acc;
    },
    {} as Record<ValidEntities<'organizationId'>, z.ZodNumber>,
  ),
);

export const membershipCountSchema = z.object({
  admin: z.number(),
  member: z.number(),
  pending: z.number(),
  total: z.number(),
});

export const fullCountsSchema = z.object({ membership: membershipCountSchema, related: entityCountSchema });

export const organizationSchema = z.object({
  ...createSelectSchema(organizationsTable).shape,
  languages: z.array(languageSchema).min(1),
  emailDomains: z.array(z.string()),
  authStrategies: z.array(z.string()),
  membership: membershipSummarySchema.nullable(),
  invitesCount: z.number(),
});

export const organizationWithMembershipSchema = organizationSchema.extend({ membership: membershipSummarySchema });

export const organizationCreateBodySchema = z.object({
  name: validNameSchema,
  slug: validSlugSchema,
});

export const organizationUpdateBodySchema = createInsertSchema(organizationsTable, {
  slug: validSlugSchema,
  name: validNameSchema,
  shortName: validNameSchema.nullable(),
  languages: z.array(languageSchema).min(1),
  defaultLanguage: languageSchema.optional(),
  emailDomains: validDomainsSchema,
  authStrategies: z.array(z.string()).optional(),
  websiteUrl: validUrlSchema.nullable(),
  thumbnailUrl: validImageKeySchema.nullable(),
  bannerUrl: validImageKeySchema.nullable(),
  logoUrl: validImageKeySchema.nullable(),
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

export const organizationListQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'name', 'userRole', 'createdAt']).default('createdAt').optional(),
  }),
);
